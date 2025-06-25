# Building AI Meeting Participants with Recall.ai

## **Quick Setup (30 minutes to first prototype)**

### **Step 1: Get Started with Recall.ai**

1. **Sign up**: Go to [recall.ai](https://www.recall.ai) and create an account
2. **Get API key**: Navigate to the Recall dashboard and create your API key
3. **Pricing**: Approximately $0.69-1.50 per meeting hour (plus $0.10/hour for 4-core bots if needed)

### **Step 2: Create Your AI Agent Webpage**

This webpage will be rendered inside the meeting as your AI participant's video feed:

```html
<!DOCTYPE html>
<html>
<head>
    <title>AI Meeting Assistant</title>
    <style>
        body {
            background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            overflow: hidden;
        }
        
        .agent-container {
            text-align: center;
            padding: 40px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
            border: 1px solid rgba(255, 255, 255, 0.18);
            max-width: 600px;
        }
        
        .agent-avatar {
            font-size: 4rem;
            margin-bottom: 20px;
            animation: pulse 2s infinite;
        }
        
        .agent-name {
            font-size: 2rem;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        .agent-status {
            font-size: 1.2rem;
            margin-bottom: 20px;
            padding: 10px 20px;
            border-radius: 25px;
            display: inline-block;
        }
        
        .status-listening { 
            background: rgba(34, 197, 94, 0.3);
            color: #4ade80;
        }
        .status-speaking { 
            background: rgba(251, 191, 36, 0.3);
            color: #fbbf24;
        }
        .status-processing { 
            background: rgba(96, 165, 250, 0.3);
            color: #60a5fa;
        }
        
        .transcript-box {
            background: rgba(0, 0, 0, 0.3);
            padding: 20px;
            border-radius: 15px;
            margin-top: 20px;
            min-height: 100px;
            max-height: 200px;
            overflow-y: auto;
            text-align: left;
        }
        
        .speaking-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: #4ade80;
            border-radius: 50%;
            margin-right: 8px;
            animation: blink 1s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0.3; }
        }
    </style>
</head>
<body>
    <div class="agent-container">
        <div class="agent-avatar">🤖</div>
        <div class="agent-name">AI Assistant</div>
        <div class="agent-status" id="status">Initializing...</div>
        <div class="transcript-box" id="transcript">
            <div>Ready to assist with your meeting...</div>
        </div>
    </div>
    
    <script src="agent.js"></script>
</body>
</html>
```

### **Step 3: AI Agent Logic (agent.js)**

```javascript
class MeetingAI {
    constructor() {
        this.isListening = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.statusEl = document.getElementById('status');
        this.transcriptEl = document.getElementById('transcript');
        this.conversationContext = [];
        
        this.init();
    }
    
    async init() {
        try {
            // Access the meeting audio stream provided by Recall.ai
            const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: false 
            });
            
            this.setupAudioProcessing(mediaStream);
            this.setupSpeechRecognition();
            this.updateStatus('Listening...', 'listening');
            
            console.log('AI Agent initialized successfully');
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.updateStatus('Setup Error', 'error');
        }
    }
    
    setupAudioProcessing(mediaStream) {
        // Process the mixed meeting audio from Recall.ai
        const meetingAudioTrack = mediaStream.getAudioTracks()[0];
        
        if (meetingAudioTrack) {
            console.log('Meeting audio track acquired');
            
            // Optional: Set up audio analysis for better speech detection
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(mediaStream);
            const analyser = audioContext.createAnalyser();
            source.connect(analyser);
            
            // You can add volume detection, silence detection, etc. here
        }
    }
    
    setupSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error('Speech recognition not supported');
            this.updateStatus('Speech recognition not available', 'error');
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        
        let finalTranscript = '';
        let processingTimeout;
        
        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // Update display with real-time transcript
            if (interimTranscript) {
                this.transcriptEl.innerHTML = `
                    <div><strong>Hearing:</strong> "${interimTranscript}"</div>
                    ${this.transcriptEl.innerHTML}
                `;
            }
            
            // Process final transcript after a pause
            if (finalTranscript) {
                clearTimeout(processingTimeout);
                processingTimeout = setTimeout(() => {
                    this.processMessage(finalTranscript);
                    finalTranscript = '';
                }, 1500); // Wait for speech pause
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                this.updateStatus('Microphone permission required', 'error');
            }
        };
        
        this.recognition.onend = () => {
            // Restart recognition if it stops
            if (this.isListening) {
                setTimeout(() => this.recognition.start(), 100);
            }
        };
        
        this.isListening = true;
        this.recognition.start();
    }
    
    async processMessage(message) {
        if (!this.shouldRespond(message)) {
            return;
        }
        
        this.updateStatus('Processing...', 'processing');
        
        // Add to conversation context
        this.conversationContext.push({
            role: 'user',
            content: message,
            timestamp: Date.now()
        });
        
        // Keep context manageable (last 10 exchanges)
        if (this.conversationContext.length > 20) {
            this.conversationContext = this.conversationContext.slice(-20);
        }
        
        this.transcriptEl.innerHTML = `
            <div><strong>Processing:</strong> "${message}"</div>
            ${this.transcriptEl.innerHTML}
        `;
        
        try {
            const response = await this.generateAIResponse(message);
            this.speak(response);
            
            // Add AI response to context
            this.conversationContext.push({
                role: 'assistant',
                content: response,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('AI processing failed:', error);
            this.speak("I'm having trouble processing that. Could you repeat?");
        }
    }
    
    shouldRespond(message) {
        const lowerMessage = message.toLowerCase();
        
        // Respond to direct mentions
        const directMentions = [
            'ai', 'assistant', 'bot', 'help me', 'what do you think',
            'ai assistant', 'hey ai', 'question for you'
        ];
        
        // Respond to questions
        const questionPatterns = [
            '?', 'how do', 'what is', 'can you', 'would you',
            'should we', 'do you think', 'any thoughts'
        ];
        
        // Respond to action items
        const actionPatterns = [
            'action item', 'todo', 'follow up', 'next steps',
            'assign', 'task', 'deadline'
        ];
        
        return [...directMentions, ...questionPatterns, ...actionPatterns]
            .some(trigger => lowerMessage.includes(trigger));
    }
    
    async generateAIResponse(message) {
        // For production, replace with your AI service
        // Here's an example with OpenAI:
        
        /*
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI assistant participating in a business meeting. 
                                 Be helpful, concise (1-2 sentences), and professional. 
                                 You can see the conversation context and should provide relevant insights.`
                    },
                    ...this.conversationContext.slice(-6), // Recent context
                    { role: 'user', content: message }
                ],
                max_tokens: 100,
                temperature: 0.7
            })
        });
        
        const data = await response.json();
        return data.choices[0].message.content;
        */
        
        // Placeholder responses for testing
        const contextualResponses = [
            `That's a great point about "${message.slice(0, 20)}...". I think we should consider the broader implications.`,
            `Thanks for bringing that up. Based on what I'm hearing, here's my perspective...`,
            `Interesting question. Let me think about that in the context of our discussion.`,
            `I can help with that. From what I understand, we should focus on...`,
            `Good observation. That aligns with what we discussed earlier about...`
        ];
        
        return contextualResponses[Math.floor(Math.random() * contextualResponses.length)];
    }
    
    speak(text) {
        this.updateStatus('Speaking...', 'speaking');
        
        // Cancel any ongoing speech
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Configure voice for professional sound
        const voices = this.synthesis.getVoices();
        const preferredVoice = voices.find(voice => 
            voice.name.includes('Google') || 
            voice.name.includes('Microsoft') ||
            voice.name.includes('Alex') ||
            voice.lang.includes('en-US')
        );
        
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        
        utterance.onstart = () => {
            this.transcriptEl.innerHTML = `
                <div><strong>🗣️ AI:</strong> "${text}"</div>
                ${this.transcriptEl.innerHTML}
            `;
        };
        
        utterance.onend = () => {
            this.updateStatus('Listening...', 'listening');
        };
        
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            this.updateStatus('Speech error', 'error');
        };
        
        this.synthesis.speak(utterance);
    }
    
    updateStatus(text, className) {
        this.statusEl.textContent = text;
        this.statusEl.className = `agent-status status-${className}`;
        
        if (className === 'speaking') {
            this.statusEl.innerHTML = `<span class="speaking-indicator"></span>${text}`;
        }
    }
}

// Initialize the AI agent when page loads
document.addEventListener('DOMContentLoaded', () => {
    new MeetingAI();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden');
    } else {
        console.log('Page visible');
    }
});
```

### **Step 4: Deploy Your AI Agent to Meetings**

Create a backend service to deploy bots:

```python
# app.py - Flask backend
import os
import requests
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

RECALL_API_KEY = os.environ.get('RECALL_API_KEY')
AGENT_URL = os.environ.get('AGENT_URL', 'https://yourdomain.com/agent.html')

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
```

### **Step 5: Simple Dashboard for Your Subscribers**

```html
<!-- templates/dashboard.html -->
<!DOCTYPE html>
<html>
<head>
    <title>AI Meeting Assistant Dashboard</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 40px 20px;
            background: #f8fafc;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
        }
        h1 { color: #1e293b; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: 600; color: #374151; }
        input { 
            width: 100%; 
            padding: 12px; 
            border: 2px solid #e5e7eb; 
            border-radius: 8px; 
            font-size: 16px;
        }
        input:focus { 
            outline: none; 
            border-color: #3b82f6; 
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        button {
            background: #3b82f6;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
        }
        button:hover { background: #2563eb; }
        button:disabled { background: #9ca3af; cursor: not-allowed; }
        .status { 
            margin-top: 20px; 
            padding: 16px; 
            border-radius: 8px; 
            display: none;
        }
        .status.success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
        .status.error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Deploy AI Meeting Assistant</h1>
        
        <form id="deployForm">
            <div class="form-group">
                <label for="meetingUrl">Meeting URL:</label>
                <input 
                    type="url" 
                    id="meetingUrl" 
                    placeholder="https://us02web.zoom.us/j/1234567890" 
                    required
                >
                <small>Supports Zoom, Google Meet, Microsoft Teams, and Webex</small>
            </div>
            
            <div class="form-group">
                <label for="agentName">AI Agent Name:</label>
                <input 
                    type="text" 
                    id="agentName" 
                    value="AI Assistant" 
                    required
                >
            </div>
            
            <button type="submit" id="deployBtn">Deploy AI Agent</button>
        </form>
        
        <div id="status" class="status"></div>
    </div>

    <script>
        document.getElementById('deployForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const deployBtn = document.getElementById('deployBtn');
            const statusDiv = document.getElementById('status');
            const meetingUrl = document.getElementById('meetingUrl').value;
            const agentName = document.getElementById('agentName').value;
            
            deployBtn.disabled = true;
            deployBtn.textContent = 'Deploying...';
            statusDiv.style.display = 'none';
            
            try {
                const response = await fetch('/deploy-agent', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        meeting_url: meetingUrl,
                        agent_name: agentName
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    statusDiv.className = 'status success';
                    statusDiv.textContent = `✅ ${result.message} Bot ID: ${result.bot_id}`;
                    statusDiv.style.display = 'block';
                } else {
                    throw new Error(result.error);
                }
                
            } catch (error) {
                statusDiv.className = 'status error';
                statusDiv.textContent = `❌ Error: ${error.message}`;
                statusDiv.style.display = 'block';
            } finally {
                deployBtn.disabled = false;
                deployBtn.textContent = 'Deploy AI Agent';
            }
        });
    </script>
</body>
</html>
```

## **Advanced Features You Can Add**

### **1. Real AI Integration**
Replace the placeholder responses with actual AI services:

```javascript
// OpenAI integration
async generateAIResponse(message) {
    const response = await fetch('/api/openai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            context: this.conversationContext.slice(-6)
        })
    });
    
    const data = await response.json();
    return data.response;
}
```

### **2. Meeting Context Awareness**
```javascript
// Track meeting topics and participants
class MeetingContext {
    constructor() {
        this.participants = new Set();
        this.topics = [];
        this.actionItems = [];
        this.decisions = [];
    }
    
    addMessage(speaker, message) {
        this.participants.add(speaker);
        this.topics.push({ speaker, message, timestamp: Date.now() });
        
        // Extract action items
        if (message.includes('action item') || message.includes('will follow up')) {
            this.actionItems.push({ content: message, assignee: speaker });
        }
    }
    
    getSummary() {
        return {
            participantCount: this.participants.size,
            topicCount: this.topics.length,
            actionItems: this.actionItems
        };
    }
}
```

### **3. Voice Customization**
```javascript
setupVoicePreferences() {
    const voices = speechSynthesis.getVoices();
    
    // Professional voice options
    const professionalVoices = voices.filter(voice => 
        voice.name.includes('Google') ||
        voice.name.includes('Microsoft') ||
        (voice.lang === 'en-US' && voice.localService)
    );
    
    this.selectedVoice = professionalVoices[0] || voices[0];
}
```

## **Production Deployment Checklist**

- [ ] **Host agent webpage** on reliable CDN (Vercel, Netlify, etc.)
- [ ] **Secure API keys** using environment variables
- [ ] **Add user authentication** for subscriber access
- [ ] **Implement usage tracking** for billing
- [ ] **Add error handling** and logging
- [ ] **Set up monitoring** for bot performance
- [ ] **Create subscriber management** dashboard
- [ ] **Add webhook handling** for real-time updates
- [ ] **Implement rate limiting** to prevent abuse
- [ ] **Add support for multiple AI models** and voices

## **What Your Subscribers Experience**

1. **Simple Setup**: They provide a meeting URL through your dashboard
2. **Instant Deployment**: AI agent joins their meeting within 30 seconds
3. **Natural Interaction**: Agent appears as a participant, listens and responds
4. **Professional Appearance**: Branded AI agent with custom name and avatar
5. **Intelligent Responses**: Context-aware AI that adds value to discussions

This approach gives you a complete AI meeting participant solution that can be deployed to any video conferencing platform through a single API. The AI agent acts exactly like a real participant - it joins the meeting, occupies a video tile, listens to conversations, and speaks responses naturally.