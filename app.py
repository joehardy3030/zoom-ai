# app.py - Flask backend
import os
import requests
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import threading
import time
import json
from datetime import datetime

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Configure CORS to allow requests from any origin - needed for recall.ai/Zoom integration
CORS(app, resources={r"/*": {"origins": "*", "allow_headers": "*", "expose_headers": "*"}})

RECALL_API_KEY = os.environ.get('RECALL_API_KEY')
RECALL_REGION = os.environ.get('RECALL_REGION', 'us-west-2')
AGENT_URL = os.environ.get('AGENT_URL', 'https://joehardy3030.github.io/zoom-ai/agent.html')

def get_current_backend_url():
    """Get the current backend URL from the tunnel URL file or environment"""
    try:
        # First try to read from the current_url.txt file
        if os.path.exists('current_url.txt'):
            with open('current_url.txt', 'r') as f:
                url = f.read().strip()
                if url:
                    print(f"🔍 DEBUG: Using tunnel URL from file: {url}")
                    return url
    except Exception as e:
        print(f"⚠️  Could not read tunnel URL from file: {e}")
    
    # Fallback to environment variable
    env_url = os.getenv('BACKEND_URL')
    if env_url:
        print(f"🔍 DEBUG: Using BACKEND_URL from environment: {env_url}")
        return env_url
    
    print("❌ No backend URL found in file or environment!")
    return None

# Debug: Print loaded configuration (remove in production)
print(f"Debug: API Key loaded: {'✅ Yes' if RECALL_API_KEY else '❌ No'}")
print(f"Debug: Region: {RECALL_REGION}")
print(f"Debug: Agent URL: {AGENT_URL}")
print(f"Debug: Backend URL: {get_current_backend_url()}")

# --- In-memory storage for transcripts and audio commands ---
# In production, you would use a database like Redis or PostgreSQL.
transcript_data_store = {}
audio_commands_store = {}  # Store audio commands for each bot
# A lock to ensure thread-safe access to the data store
transcript_lock = threading.Lock()
audio_lock = threading.Lock()

# Construct API URL based on region
def get_recall_api_base():
    return f'https://{RECALL_REGION}.recall.ai/api/v1'

# Note: We use get_current_backend_url() to dynamically read the tunnel URL

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
    # Get our backend URL for the agent to use
    current_backend_url = get_current_backend_url()
    
    if not current_backend_url:
        return jsonify({"success": False, "error": "No backend URL available. Please ensure the tunnel is running."}), 500
    
    webhook_url = current_backend_url + "/api/webhook/transcript"
    
    # DEBUG: Print what backend URL we're actually using
    print(f"🔍 DEBUG: Current backend URL: {current_backend_url}")
    print(f"🔍 DEBUG: webhook_url: {webhook_url}")

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
                    # Use our optimized agent - IMPORTANT: Use single curly braces for BOT_ID placeholder
                    "url": f"{AGENT_URL}?bot_id={{BOT_ID}}&backend_url={requests.utils.quote(current_backend_url)}&v=1.0.14",
                    "width": 1280,
                    "height": 720
                }
            }
        }
    }
    
    # DEBUG: Print the actual agent URL being sent to Recall.ai
    agent_full_url = f"{AGENT_URL}?bot_id={{BOT_ID}}&backend_url={requests.utils.quote(current_backend_url)}"
    print(f"🔍 DEBUG: Full agent URL being sent to Recall.ai: {agent_full_url}")
    
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

# Audio functionality
@app.route('/audio/<filename>')
def serve_audio(filename):
    """Serve audio files from the audio directory with better streaming support"""
    try:
        # Add headers for better audio streaming
        response = send_from_directory('audio', filename)
        
        # Set headers for better streaming and caching
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Cache-Control'] = 'public, max-age=3600'  # Cache for 1 hour
        response.headers['Content-Type'] = 'audio/mpeg'
        
        # Enable CORS for the audio files
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Range'
        
        return response
    except Exception as e:
        print(f"Error serving audio file {filename}: {e}")
        return jsonify({"error": "Audio file not found"}), 404

@app.route('/api/recall-bots', methods=['GET'])
def list_recall_bots():
    """List all bots from Recall.ai API"""
    headers = {
        'Authorization': f'Token {RECALL_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    try:
        api_base = get_recall_api_base()
        response = requests.get(
            f'{api_base}/bot',
            headers=headers
        )
        
        if response.status_code == 200:
            bots = response.json()
            return jsonify({
                'success': True,
                'bots': bots,
                'count': len(bots.get('results', [])) if 'results' in bots else len(bots)
            })
        else:
            return jsonify({
                'error': f'Failed to list bots: {response.text}',
                'status_code': response.status_code
            }), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/recall-bots/<bot_id>', methods=['DELETE'])
def delete_recall_bot(bot_id):
    """Delete a specific bot from Recall.ai"""
    headers = {
        'Authorization': f'Token {RECALL_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    try:
        api_base = get_recall_api_base()
        response = requests.delete(
            f'{api_base}/bot/{bot_id}',
            headers=headers
        )
        
        if response.status_code == 204:
            # Also clean up local data
            with transcript_lock:
                if bot_id in transcript_data_store:
                    del transcript_data_store[bot_id]
            
            with audio_lock:
                if bot_id in audio_commands_store:
                    del audio_commands_store[bot_id]
            
            return jsonify({
                'success': True,
                'message': f'Bot {bot_id} deleted successfully'
            })
        else:
            return jsonify({
                'error': f'Failed to delete bot: {response.text}',
                'status_code': response.status_code
            }), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot/<bot_id>/play-audio', methods=['POST'])
def play_audio(bot_id):
    """Store a play audio command for a specific bot"""
    data = request.get_json()
    audio_file = data.get('audio_file', 'ElevenLabs_2025-06-06T23_00_36_karma_20250606-VO_pvc_sp100_s63_sb67_se0_b_m2.mp3')
    
    print(f"Play audio command received for Bot {bot_id}: {audio_file}")
    
    with audio_lock:
        if bot_id not in audio_commands_store:
            audio_commands_store[bot_id] = []
        
        # Add play command
        audio_commands_store[bot_id].append({
            "command": "play",
            "audio_file": audio_file,
            "timestamp": time.time()
        })
        
        # Keep only the last 10 commands
        audio_commands_store[bot_id] = audio_commands_store[bot_id][-10:]
    
    return jsonify({"status": "play command sent", "audio_file": audio_file})

@app.route('/api/bot/<bot_id>/stop-audio', methods=['POST'])
def stop_audio(bot_id):
    """Store a stop audio command for a specific bot"""
    print(f"Stop audio command received for Bot {bot_id}")
    
    with audio_lock:
        if bot_id not in audio_commands_store:
            audio_commands_store[bot_id] = []
        
        # Add stop command
        audio_commands_store[bot_id].append({
            "command": "stop",
            "timestamp": time.time()
        })
        
        # Keep only the last 10 commands
        audio_commands_store[bot_id] = audio_commands_store[bot_id][-10:]
    
    return jsonify({"status": "stop command sent"})

@app.route('/api/bot/<bot_id>/audio-command', methods=['GET'])
def get_audio_command(bot_id):
    """Get pending audio commands for a specific bot"""
    print(f"Audio command requested for Bot ID: '{bot_id}'")
    
    # Handle placeholder bot ID like we do for transcripts
    available_bots = list(audio_commands_store.keys())
    
    if bot_id == '{BOT_ID}' or bot_id == '%7BBOT_ID%7D':
        if len(available_bots) == 1:
            real_bot_id = available_bots[0]
            print(f"Using the only active bot ID: {real_bot_id} for audio command request")
            bot_id = real_bot_id
        elif len(available_bots) > 1:
            latest_bot_id = available_bots[0]
            print(f"Multiple bots active, using: {latest_bot_id}")
            bot_id = latest_bot_id
    
    with audio_lock:
        if bot_id in audio_commands_store and audio_commands_store[bot_id]:
            # Return the most recent command and remove it
            command = audio_commands_store[bot_id].pop()
            print(f"Serving audio command for Bot '{bot_id}': {command}")
            return jsonify(command)
        else:
            # No commands pending
            return jsonify({"command": "none"})

@app.route('/api/recall-bots/<bot_id>/delete-media', methods=['POST'])
def delete_bot_media(bot_id):
    """Delete media (recordings, transcripts, etc.) for a specific bot"""
    headers = {
        'Authorization': f'Token {RECALL_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    try:
        api_base = get_recall_api_base()
        response = requests.post(
            f'{api_base}/bot/{bot_id}/delete_media',
            headers=headers
        )
        
        if response.status_code == 200:
            return jsonify({
                'success': True,
                'message': f'Media for bot {bot_id} deleted successfully'
            })
        else:
            return jsonify({
                'error': f'Failed to delete bot media: {response.text}',
                'status_code': response.status_code
            }), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/recall-bots/delete-all-media', methods=['POST'])
def delete_all_bot_media():
    """Delete media for all bots"""
    headers = {
        'Authorization': f'Token {RECALL_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    try:
        # First get all bots
        api_base = get_recall_api_base()
        response = requests.get(
            f'{api_base}/bot',
            headers=headers
        )
        
        if response.status_code != 200:
            return jsonify({
                'error': f'Failed to list bots: {response.text}',
                'status_code': response.status_code
            }), 400
        
        bots_data = response.json()
        bots = bots_data.get('results', []) if 'results' in bots_data else bots_data
        
        if not bots:
            return jsonify({
                'success': True,
                'message': 'No bots found to delete media from',
                'deleted_count': 0
            })
        
        # Delete media for each bot
        deleted_count = 0
        errors = []
        
        for bot in bots:
            bot_id = bot.get('id')
            if not bot_id:
                continue
                
            try:
                media_response = requests.post(
                    f'{api_base}/bot/{bot_id}/delete_media',
                    headers=headers
                )
                
                if media_response.status_code == 200:
                    deleted_count += 1
                else:
                    errors.append(f"Bot {bot_id}: {media_response.text}")
                    
            except Exception as e:
                errors.append(f"Bot {bot_id}: {str(e)}")
        
        return jsonify({
            'success': True,
            'message': f'Deleted media for {deleted_count} out of {len(bots)} bots',
            'deleted_count': deleted_count,
            'total_bots': len(bots),
            'errors': errors if errors else None
        })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Note: For local development, you'll need to use a tool like ngrok
    # to expose your localhost to the internet for the webhook to work.
    # Example: ngrok http 5000
    app.run(debug=True, port=5000)