# app.py - Flask backend
import os
import requests
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

RECALL_API_KEY = os.environ.get('RECALL_API_KEY')
RECALL_REGION = os.environ.get('RECALL_REGION', 'us-west-2')
AGENT_URL = os.environ.get('AGENT_URL', 'https://joehardy3030.github.io/zoom-ai/agent.html')

# Debug: Print loaded configuration (remove in production)
print(f"Debug: API Key loaded: {'✅ Yes' if RECALL_API_KEY else '❌ No'}")
print(f"Debug: Region: {RECALL_REGION}")
print(f"Debug: Agent URL: {AGENT_URL}")

# Construct API URL based on region
def get_recall_api_base():
    return f'https://{RECALL_REGION}.recall.ai/api/v1'

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
    
    # Create bot with Output Media
    bot_payload = {
        "meeting_url": meeting_url,
        "bot_name": agent_name,
        "output_media": {
            "camera": {
                "kind": "webpage",
                "config": {
                    "url": AGENT_URL,
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

if __name__ == '__main__':
    app.run(debug=True)