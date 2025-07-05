# app.py - Flask backend
import os
import requests
from flask import Flask, request, jsonify, render_template, send_from_directory, Response
from flask_cors import CORS
from dotenv import load_dotenv
import threading
import time
import json
from datetime import datetime
import re

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Configure CORS to allow requests from any origin - needed for recall.ai/Zoom integration
CORS(app, resources={r"/*": {"origins": "*", "allow_headers": "*", "expose_headers": "*"}})

RECALL_API_KEY = os.environ.get('RECALL_API_KEY')
RECALL_REGION = os.environ.get('RECALL_REGION', 'us-west-2')
AGENT_URL = os.environ.get('AGENT_URL', 'https://joehardy3030.github.io/zoom-ai/agent.html')

# Load version info
def load_version():
    try:
        with open('version.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"version": "1.0.0", "name": "Unknown", "build_date": "Unknown"}

VERSION_INFO = load_version()

# Global variable to store the most recently deployed bot ID
most_recent_bot_id = None

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

# Global variables for storing transcript and audio data
transcript_data_store = {}  # bot_id -> list of transcript lines
audio_commands_store = {}   # bot_id -> list of audio commands
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
    global most_recent_bot_id
    data = request.get_json()
    meeting_url = data.get('meeting_url')
    agent_name = data.get('agent_name', 'AI Assistant')
    
    if not meeting_url:
        return jsonify({'error': 'Meeting URL is required'}), 400
    
    # Clean up old bot data before deploying new bot
    print("🧹 Cleaning up old bot data before deploying new bot...")
    cleanup_old_bots()
    
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
                    "url": f"{AGENT_URL}?bot_id={{BOT_ID}}&backend_url={requests.utils.quote(current_backend_url)}&v={VERSION_INFO['version']}",
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
            new_bot_id = bot_data['id']
            
            # Store the most recent bot ID globally
            most_recent_bot_id = new_bot_id
            print(f"🎯 DEPLOYED: New bot ID stored globally: {most_recent_bot_id}")
            
            # Clean up again after deployment to ensure only the new bot remains
            print(f"🧹 Final cleanup - ensuring only new bot {new_bot_id} data is kept...")
            cleanup_old_bots()
            
            return jsonify({
                'success': True,
                'bot_id': new_bot_id,
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
    """Serve audio files from the audio directory with optimized streaming support"""
    try:
        # Get the full file path
        file_path = os.path.join('audio', filename)
        
        if not os.path.exists(file_path):
            return jsonify({"error": "Audio file not found"}), 404
        
        # Get file size for range requests
        file_size = os.path.getsize(file_path)
        
        # Handle range requests for better streaming
        range_header = request.headers.get('Range', None)
        if range_header:
            # Parse range header (e.g., "bytes=0-1023")
            byte_start = 0
            byte_end = file_size - 1
            
            if range_header:
                match = re.search(r'bytes=(\d+)-(\d*)', range_header)
                if match:
                    byte_start = int(match.group(1))
                    if match.group(2):
                        byte_end = int(match.group(2))
            
            # Read the requested chunk
            with open(file_path, 'rb') as f:
                f.seek(byte_start)
                chunk_size = byte_end - byte_start + 1
                data = f.read(chunk_size)
            
            # Create partial content response
            response = Response(
                data,
                206,  # Partial Content
                headers={
                    'Content-Range': f'bytes {byte_start}-{byte_end}/{file_size}',
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(chunk_size),
                    'Content-Type': 'audio/mpeg',
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range'
                }
            )
            return response
        else:
            # Regular full file response with streaming
            def generate():
                with open(file_path, 'rb') as f:
                    while True:
                        chunk = f.read(8192)  # 8KB chunks for smooth streaming
                        if not chunk:
                            break
                        yield chunk
            
            response = Response(
                generate(),
                headers={
                    'Content-Type': 'audio/mpeg',
                    'Content-Length': str(file_size),
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range'
                }
            )
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
    """Store a play audio command for a specific bot - only one command at a time"""
    data = request.get_json()
    audio_file = data.get('audio_file', 'ElevenLabs_2025-06-06T23_00_36_karma_20250606-VO_pvc_sp100_s63_sb67_se0_b_m2.mp3')
    
    print(f"Play audio command received for Bot {bot_id}: {audio_file}")
    
    with audio_lock:
        current_time = time.time()
        
        # Check if there's a recent command (within 5 seconds) to prevent spam
        if bot_id in audio_commands_store:
            existing_command = audio_commands_store[bot_id]
            time_since_last = current_time - existing_command.get('timestamp', 0)
            
            if time_since_last < 5.0 and existing_command.get('command') == 'play':
                print(f"Ignoring rapid play command for Bot {bot_id} (last command was {time_since_last:.1f}s ago)")
                return jsonify({"status": "ignored - too soon after last command", "audio_file": audio_file})
        
        # Only store ONE command per bot - replace any existing command
        audio_commands_store[bot_id] = {
            "command": "play",
            "audio_file": audio_file,
            "timestamp": current_time,
            "served": False  # Track if this command has been served
        }
    
    return jsonify({"status": "play command sent", "audio_file": audio_file})

@app.route('/api/bot/<bot_id>/stop-audio', methods=['POST'])
def stop_audio(bot_id):
    """Store a stop audio command for a specific bot - only one command at a time"""
    print(f"Stop audio command received for Bot {bot_id}")
    
    with audio_lock:
        # Only store ONE command per bot - replace any existing command
        audio_commands_store[bot_id] = {
            "command": "stop",
            "timestamp": time.time(),
            "served": False  # Track if this command has been served
        }
    
    return jsonify({"status": "stop command sent"})

@app.route('/api/bot/<bot_id>/audio-command', methods=['GET'])
def get_audio_command(bot_id):
    """Get pending audio command for a specific bot - single command only"""
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
        if bot_id in audio_commands_store:
            command_data = audio_commands_store[bot_id]
            
            # Check if command has already been served
            if command_data.get('served', False):
                print(f"Command already served for Bot '{bot_id}', returning none")
                return jsonify({"command": "none"})
            
            # Mark as served and return the command
            audio_commands_store[bot_id]['served'] = True
            
            # Return the command without the 'served' flag
            response_command = {
                "command": command_data["command"],
                "timestamp": command_data["timestamp"]
            }
            
            # Add audio_file if it's a play command
            if command_data["command"] == "play" and "audio_file" in command_data:
                response_command["audio_file"] = command_data["audio_file"]
            
            print(f"Serving audio command for Bot '{bot_id}': {response_command}")
            return jsonify(response_command)
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

@app.route('/api/version', methods=['GET'])
def get_version():
    """Get current version information"""
    return jsonify(VERSION_INFO)

@app.route('/api/cleanup-old-bots', methods=['POST'])
def cleanup_old_bots_endpoint():
    """Manually trigger cleanup of old bot data"""
    most_recent_bot_id = cleanup_old_bots()
    if most_recent_bot_id:
        return jsonify({
            'success': True,
            'most_recent_bot_id': most_recent_bot_id,
            'message': 'Old bot data cleaned up successfully'
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Failed to cleanup old bot data'
        }), 500

def cleanup_old_bots():
    """Remove data for old/expired bots, keeping only the most recent active bot"""
    global most_recent_bot_id
    
    try:
        # If we have a specific bot ID stored, use that
        if most_recent_bot_id:
            print(f"🧹 Cleanup: Using stored most recent bot ID: {most_recent_bot_id}")
            
            # Clean up transcript data - keep only the most recent bot
            with transcript_lock:
                old_bot_ids = [bot_id for bot_id in transcript_data_store.keys() if bot_id != most_recent_bot_id]
                for old_bot_id in old_bot_ids:
                    print(f"🧹 Removing old transcript data for bot: {old_bot_id}")
                    del transcript_data_store[old_bot_id]
            
            # Clean up audio commands - keep only the most recent bot
            with audio_lock:
                old_bot_ids = [bot_id for bot_id in audio_commands_store.keys() if bot_id != most_recent_bot_id]
                for old_bot_id in old_bot_ids:
                    print(f"🧹 Removing old audio data for bot: {old_bot_id}")
                    del audio_commands_store[old_bot_id]
                    
            return most_recent_bot_id
        
        # Fallback: Get all bots from Recall API and find the most recent one
        print("🧹 No stored bot ID, checking Recall API...")
        headers = {
            'Authorization': f'Token {RECALL_API_KEY}',
            'Content-Type': 'application/json'
        }
        api_base = get_recall_api_base()
        response = requests.get(f'{api_base}/bot', headers=headers)
        
        if response.status_code == 200:
            bots_data = response.json()
            all_bots = bots_data.get('results', []) if 'results' in bots_data else bots_data
            
            if all_bots:
                # Filter out expired bots first
                active_bots = [bot for bot in all_bots if bot.get('status') != 'media_expired']
                bots_to_use = active_bots if active_bots else all_bots
                
                # Just use the first bot (should be most recent) since dates aren't working
                selected_bot = bots_to_use[0]
                selected_bot_id = selected_bot['id']
                
                print(f"🧹 Cleanup: Selected bot ID from API: {selected_bot_id}")
                print(f"🧹 Cleanup: Bot status: {selected_bot.get('status', 'unknown')}")
                print(f"🧹 Cleanup: Total bots found: {len(all_bots)}")
                print(f"🧹 Cleanup: Active bots: {len(active_bots)}")
                
                # Clean up transcript data - keep only the selected bot
                with transcript_lock:
                    old_bot_ids = [bot_id for bot_id in transcript_data_store.keys() if bot_id != selected_bot_id]
                    for old_bot_id in old_bot_ids:
                        print(f"🧹 Removing old transcript data for bot: {old_bot_id}")
                        del transcript_data_store[old_bot_id]
                
                # Clean up audio commands - keep only the selected bot
                with audio_lock:
                    old_bot_ids = [bot_id for bot_id in audio_commands_store.keys() if bot_id != selected_bot_id]
                    for old_bot_id in old_bot_ids:
                        print(f"🧹 Removing old audio data for bot: {old_bot_id}")
                        del audio_commands_store[old_bot_id]
                        
                return selected_bot_id
                
    except Exception as e:
        print(f"Error during cleanup: {e}")
    
    return None

@app.route('/api/latest-bot-id', methods=['GET'])
def get_latest_bot_id():
    """Get the most recently deployed bot ID"""
    global most_recent_bot_id
    if most_recent_bot_id:
        return jsonify({
            'success': True,
            'bot_id': most_recent_bot_id
        })
    else:
        return jsonify({
            'success': False,
            'message': 'No bot has been deployed yet'
        }), 404

@app.route('/api/bot/<bot_id>/speak-audio', methods=['POST'])
def speak_audio(bot_id):
    """Make the Recall.ai bot speak audio through Zoom's native audio system"""
    data = request.get_json()
    audio_file = data.get('audio_file', 'ElevenLabs_2025-06-06T23_00_36_karma_20250606-VO_pvc_sp100_s63_sb67_se0_b_m2.mp3')
    
    print(f"🤖 BOT SPEAK: Making bot {bot_id} speak: {audio_file}")
    
    try:
        # Get the current backend URL for constructing the audio file URL
        current_backend_url = get_current_backend_url()
        audio_url = f"{current_backend_url}/audio/{audio_file}"
        
        # Use Recall.ai's Output Audio API to make the bot speak
        headers = {
            'Authorization': f'Token {RECALL_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        # Output Audio API payload
        payload = {
            "audio_url": audio_url
        }
        
        # Call Recall.ai's Output Audio API
        recall_url = f"https://us-east-1.recall.ai/api/v1/bot/{bot_id}/output_audio/"
        response = requests.post(recall_url, json=payload, headers=headers)
        
        if response.status_code == 200:
            print(f"✅ BOT SPEAK: Successfully started bot audio output")
            return jsonify({
                "status": "success", 
                "message": "Bot is now speaking",
                "audio_file": audio_file,
                "audio_url": audio_url
            })
        else:
            print(f"❌ BOT SPEAK: Recall.ai API error: {response.status_code} - {response.text}")
            return jsonify({
                "status": "error", 
                "message": f"Recall.ai API error: {response.status_code}",
                "details": response.text
            }), 500
            
    except Exception as e:
        print(f"❌ BOT SPEAK: Error: {str(e)}")
        return jsonify({
            "status": "error", 
            "message": f"Bot speak failed: {str(e)}"
        }), 500

@app.route('/api/bot/<bot_id>/stop-speaking', methods=['POST'])
def stop_speaking(bot_id):
    """Stop the Recall.ai bot from speaking"""
    print(f"🤖 BOT STOP: Stopping bot {bot_id} from speaking")
    
    try:
        headers = {
            'Authorization': f'Token {RECALL_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        # Call Recall.ai's Delete Output Audio API
        recall_url = f"https://us-east-1.recall.ai/api/v1/bot/{bot_id}/output_audio/"
        response = requests.delete(recall_url, headers=headers)
        
        if response.status_code in [200, 204]:
            print(f"✅ BOT STOP: Successfully stopped bot audio output")
            return jsonify({
                "status": "success", 
                "message": "Bot stopped speaking"
            })
        else:
            print(f"❌ BOT STOP: Recall.ai API error: {response.status_code} - {response.text}")
            return jsonify({
                "status": "error", 
                "message": f"Recall.ai API error: {response.status_code}",
                "details": response.text
            }), 500
            
    except Exception as e:
        print(f"❌ BOT STOP: Error: {str(e)}")
        return jsonify({
            "status": "error", 
            "message": f"Bot stop failed: {str(e)}"
        }), 500

if __name__ == '__main__':
    # Note: For local development, you'll need to use a tool like ngrok
    # to expose your localhost to the internet for the webhook to work.
    # Example: ngrok http 5000
    app.run(debug=True, port=5000)