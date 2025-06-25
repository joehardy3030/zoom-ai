# app.py - Flask backend
import os
import requests
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

RECALL_API_KEY = os.environ.get('RECALL_API_KEY')
AGENT_URL = os.environ.get('AGENT_URL', 'https://localhost:5000/agent.html')

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
        response = requests.post(
            'https://api.recall.ai/api/v1/bot/',
            json=bot_payload,
            headers=headers
        )
        
        if response.status_code == 201:
            bot_data = response.json()
            return jsonify({
                'success': True,
                'bot_id': bot_data['id'],
                'message': f'AI agent deployed to meeting successfully!'
            })
        else:
            return jsonify({
                'error': f'Failed to deploy agent: {response.text}'
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
        response = requests.get(
            f'https://api.recall.ai/api/v1/bot/{bot_id}/',
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