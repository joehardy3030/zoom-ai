# app.py - Flask backend
import os
import requests
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv
import threading
import time
import json

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Configure CORS to allow requests from any origin - needed for recall.ai/Zoom integration
CORS(app, resources={r"/*": {"origins": "*", "allow_headers": "*", "expose_headers": "*"}})

RECALL_API_KEY = os.environ.get('RECALL_API_KEY')
RECALL_REGION = os.environ.get('RECALL_REGION', 'us-west-2')
AGENT_URL = os.environ.get('AGENT_URL', 'https://joehardy3030.github.io/zoom-ai/agent.html')
BACKEND_URL = os.environ.get('BACKEND_URL', 'https://your-ngrok-url-here.ngrok-free.app')

# Debug: Print loaded configuration (remove in production)
print(f"Debug: API Key loaded: {'✅ Yes' if RECALL_API_KEY else '❌ No'}")
print(f"Debug: Region: {RECALL_REGION}")
print(f"Debug: Agent URL: {AGENT_URL}")

# --- In-memory storage for transcripts (for demonstration) ---
# In production, you would use a database like Redis or PostgreSQL.
transcript_data_store = {}
# A lock to ensure thread-safe access to the data store
transcript_lock = threading.Lock()

# Construct API URL based on region
def get_recall_api_base():
    return f'https://{RECALL_REGION}.recall.ai/api/v1'

# Get our backend URL (the ngrok URL)
def get_backend_url():
    # This needs to be updated whenever ngrok changes
    return request.host_url.rstrip('/')

@app.route('/')
def home():
    return render_template('dashboard.html')

@app.route('/deploy-agent', methods=['POST'])
def deploy_agent():
    data = request.get_json()
    meeting_url = data.get('meeting_url')
    agent_name = data.get('agent_name', 'AI Assistant')
    
    if not meeting_url:
        return jsonify({'error': 'Meeting URL is required'}), 400
    
    # The webhook URL for Recall.ai to send transcript data to.
    # In production, this must be a publicly accessible URL.
    # For local development, you would use a tool like ngrok.
    webhook_url = BACKEND_URL + "/api/webhook/transcript"
    
    # Get our backend URL for the agent to use
    backend_url = BACKEND_URL

    # Create bot with Real-time Transcription enabled
    bot_payload = {
        "meeting_url": meeting_url,
        "bot_name": agent_name,
        "recording_config": {
            "transcript": {
                "provider": {
                    "meeting_captions": {} # Use the platform's native captions
                }
            },
            "realtime_endpoints": [
                {
                    "type": "webhook",
                    "url": webhook_url,
                    "events": ["transcript.data"] # We want the final transcript data
                }
            ]
        },
        "output_media": {
            "camera": {
                "kind": "webpage",
                "config": {
                    # Use proper template format for recall.ai - single braces for BOT_ID and URL encode the backend_url
                    "url": f"{AGENT_URL}?bot_id={'{BOT_ID}'}&backend_url={requests.utils.quote(backend_url)}",
                    "width": 1280,
                    "height": 720
                }
            }
        }
    }
    
    headers = {
        'Authorization': f'Token {RECALL_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    try:
        api_base = get_recall_api_base()
        response = requests.post(
            f'{api_base}/bot',  # No trailing slash
            json=bot_payload,
            headers=headers
        )
        
        if response.status_code == 201:
            bot_data = response.json()
            return jsonify({
                'success': True,
                'bot_id': bot_data['id'],
                'bot_data': bot_data,  # Return full bot data
                'message': f'AI agent deployed to meeting successfully!',
                'region': RECALL_REGION
            })
        else:
            return jsonify({
                'error': f'Failed to deploy agent: {response.text}',
                'region': RECALL_REGION,
                'api_endpoint': f'{api_base}/bot',
                'status_code': response.status_code
            }), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/bot-status/<bot_id>')
def bot_status(bot_id):
    headers = {
        'Authorization': f'Token {RECALL_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    try:
        api_base = get_recall_api_base()
        response = requests.get(
            f'{api_base}/bot/{bot_id}',  # No trailing slash
            headers=headers
        )
        
        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({'error': 'Bot not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/webhook/transcript', methods=['POST'])
def transcript_webhook():
    """
    Receives real-time transcript data from Recall.ai
    """
    payload = request.get_json()
    event_type = payload.get('event')

    # For verification of the webhook endpoint with Recall
    if event_type == 'endpoint.connected':
        print("✅ Recall.ai webhook connected successfully.")
        return jsonify({'status': 'connected'}), 200

    if event_type == 'transcript.data':
        bot_id = payload.get('data', {}).get('bot', {}).get('id')
        participant = payload.get('data', {}).get('data', {}).get('participant', {})
        words = payload.get('data', {}).get('data', {}).get('words', [])

        if not bot_id or not words:
            return jsonify({'status': 'ignoring, missing data'}), 200

        speaker_name = participant.get('name', 'Unknown Speaker')
        transcript_text = " ".join([word['text'] for word in words])
        
        print(f"Transcript Received for Bot {bot_id}: [{speaker_name}] {transcript_text}")

        with transcript_lock:
            if bot_id not in transcript_data_store:
                transcript_data_store[bot_id] = []
            
            # Add new transcript line with a timestamp
            transcript_data_store[bot_id].append({
                "speaker": speaker_name,
                "text": transcript_text,
                "timestamp": time.time()
            })
            
            # Keep only the last 20 entries
            transcript_data_store[bot_id] = transcript_data_store[bot_id][-20:]

    return jsonify({'status': 'received'}), 200


@app.route('/api/bot/<bot_id>/transcript', methods=['GET'])
def get_transcript(bot_id):
    """
    Returns the transcript for a specific bot
    """
    print(f"Transcript requested for Bot ID: '{bot_id}'")
    # Check if JSONP format is requested
    callback = request.args.get('callback')
    
    # Debug: Show all available bot IDs in transcript store
    available_bots = list(transcript_data_store.keys())
    print(f"Available bot IDs: {available_bots}")
    
    # Special handling for the placeholder case
    if bot_id == '{BOT_ID}' or bot_id == '%7BBOT_ID%7D':
        # If we only have one bot, use that (most common case)
        if len(available_bots) == 1:
            real_bot_id = available_bots[0]
            print(f"Using the only active bot ID: {real_bot_id} for placeholder request")
            bot_id = real_bot_id
        elif len(available_bots) > 1:
            # Sort by most recently active if we have multiple bots
            latest_bot_id = available_bots[0]  # Default to first
            print(f"Multiple bots active, using: {latest_bot_id}")
            bot_id = latest_bot_id
    
    # Safely access transcript data with lock
    with transcript_lock:
        if bot_id in transcript_data_store:
            response_data = list(transcript_data_store[bot_id])  # Make a copy to avoid race conditions
        else:
            # Try any available bot if we have one 
            if available_bots:
                print(f"Bot ID {bot_id} not found, using available bot: {available_bots[0]}")
                response_data = list(transcript_data_store[available_bots[0]])
            else:
                print(f"No matching bot ID found and no active bots")
                response_data = []
    
    # Debug: print what we're returning
    print(f"Serving transcript for Bot '{bot_id}': {len(response_data)} lines")
    
    # If this is a JSONP request, wrap the response in the callback function
    if callback:
        json_data = json.dumps(response_data)
        print(f"Returning JSONP response with callback: {callback}")
        return f"{callback}({json_data});", 200, {'Content-Type': 'application/javascript'}
    else:
        # Add debugging headers to see in browser console
        response = jsonify(response_data)
        response.headers['X-Debug-Lines'] = str(len(response_data))
        return response

@app.route('/api/bots', methods=['GET'])
def list_bots():
    """List all bot IDs with transcript data"""
    with transcript_lock:
        bots = {}
        for bot_id, lines in transcript_data_store.items():
            bots[bot_id] = len(lines)
    
    return jsonify({
        "active_bots": bots,
        "count": len(bots)
    })

@app.route('/api/ping', methods=['GET'])
def ping():
    """Simple ping endpoint that can work with image tags"""
    print("Ping received!")
    response = app.make_response('OK')
    response.headers['Content-Type'] = 'image/gif'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

if __name__ == '__main__':
    # Note: For local development, you'll need to use a tool like ngrok
    # to expose your localhost to the internet for the webhook to work.
    # Example: ngrok http 5000
    app.run(debug=True, port=5000)