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
            // Initialize without direct microphone access
            // Recall.ai will handle the audio streaming
            this.setupSpeechRecognition();
            this.updateStatus('Listening...', 'listening');
            
            console.log('AI Agent initialized successfully');
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.updateStatus('Setup Error', 'error');
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
                this.updateStatus('Microphone access denied - using alternative mode', 'processing');
                // Fall back to text-only mode or polling for meeting updates
                this.setupAlternativeMode();
            }
        };
        
        this.recognition.onend = () => {
            // Restart recognition if it stops
            if (this.isListening) {
                setTimeout(() => this.recognition.start(), 100);
            }
        };
        
        // Try to start speech recognition, but don't fail if not allowed
        try {
            this.isListening = true;
            this.recognition.start();
        } catch (error) {
            console.warn('Speech recognition not available, using alternative mode');
            this.setupAlternativeMode();
        }
    }
    
    setupAlternativeMode() {
        // Alternative mode without microphone access
        // This could poll for meeting events or use other triggers
        this.updateStatus('Ready (Text Mode)', 'listening');
        
        // Example: Simulate periodic meeting events or use other triggers
        setInterval(() => {
            this.simulateMeetingEvent();
        }, 30000); // Check every 30 seconds
    }
    
    simulateMeetingEvent() {
        // In a real implementation, this could:
        // 1. Poll Recall.ai API for meeting events
        // 2. Listen for PostMessage events from parent frame
        // 3. Use WebSocket connections to get real-time updates
        
        const currentTime = new Date().toLocaleTimeString();
        console.log(`Meeting check at ${currentTime}`);
        
        // Example: Provide periodic meeting insights
        if (Math.random() > 0.7) { // 30% chance
            const insights = [
                "Would you like me to summarize the key points discussed so far?",
                "I notice we've been discussing this topic for a while. Should I capture the action items?",
                "This seems like an important decision point. Would you like me to note this for the meeting summary?"
            ];
            
            const insight = insights[Math.floor(Math.random() * insights.length)];
            this.speak(insight);
        }
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
        
        // Display the text immediately for visual feedback
        this.transcriptEl.innerHTML = `
            <div><strong>🗣️ AI:</strong> "${text}"</div>
            ${this.transcriptEl.innerHTML}
        `;
        
        // Try multiple approaches for audio output
        this.attemptSpeech(text);
    }
    
    async attemptSpeech(text) {
        let speechSuccessful = false;
        
        // Method 1: Try native speechSynthesis
        if ('speechSynthesis' in window) {
            try {
                await this.trySpeechSynthesis(text);
                speechSuccessful = true;
            } catch (error) {
                console.warn('Speech synthesis failed:', error);
            }
        }
        
        // Method 2: If speech synthesis fails, try creating an audio element
        if (!speechSuccessful) {
            try {
                await this.tryAudioElement(text);
                speechSuccessful = true;
            } catch (error) {
                console.warn('Audio element method failed:', error);
            }
        }
        
        // Method 3: Fallback to visual-only mode with longer display
        if (!speechSuccessful) {
            console.log('Audio output not available, using visual-only mode');
            this.updateStatus('Speaking (Visual Mode)', 'speaking');
            
            // Keep the message visible longer in visual-only mode
            setTimeout(() => {
                this.updateStatus('Ready (Visual Mode)', 'listening');
            }, 3000);
        }
    }
    
    trySpeechSynthesis(text) {
        return new Promise((resolve, reject) => {
            // Cancel any ongoing speech
            this.synthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Wait for voices to load
            const setVoiceAndSpeak = () => {
                const voices = this.synthesis.getVoices();
                
                // Try to find a good voice
                const preferredVoice = voices.find(voice => 
                    (voice.name.includes('Google') && voice.lang.includes('en')) ||
                    (voice.name.includes('Microsoft') && voice.lang.includes('en')) ||
                    (voice.name.includes('Alex')) ||
                    (voice.lang.includes('en-US'))
                ) || voices.find(voice => voice.lang.includes('en')) || voices[0];
                
                if (preferredVoice) {
                    utterance.voice = preferredVoice;
                    console.log(`Using voice: ${preferredVoice.name}`);
                }
                
                // Configure speech parameters for better compatibility
                utterance.rate = 0.8;
                utterance.pitch = 1.0;
                utterance.volume = 1.0; // Max volume for better capture
                
                let hasStarted = false;
                let timeout = setTimeout(() => {
                    if (!hasStarted) {
                        reject(new Error('Speech synthesis timeout'));
                    }
                }, 2000);
                
                utterance.onstart = () => {
                    hasStarted = true;
                    clearTimeout(timeout);
                    console.log('Speech synthesis started');
                };
                
                utterance.onend = () => {
                    console.log('Speech synthesis completed');
                    this.updateStatus('Listening...', 'listening');
                    resolve();
                };
                
                utterance.onerror = (event) => {
                    clearTimeout(timeout);
                    console.error('Speech synthesis error:', event);
                    this.updateStatus('Speech error', 'error');
                    reject(new Error(`Speech error: ${event.error}`));
                };
                
                // Try to speak
                try {
                    this.synthesis.speak(utterance);
                } catch (e) {
                    clearTimeout(timeout);
                    reject(e);
                }
            };
            
            // Handle voice loading
            if (this.synthesis.getVoices().length > 0) {
                setVoiceAndSpeak();
            } else {
                this.synthesis.addEventListener('voiceschanged', setVoiceAndSpeak, { once: true });
                // Fallback timeout
                setTimeout(() => {
                    if (this.synthesis.getVoices().length === 0) {
                        reject(new Error('No voices available'));
                    }
                }, 1000);
            }
        });
    }
    
    async tryAudioElement(text) {
        // This method would use a TTS service to generate audio
        // For now, we'll simulate it
        console.log('Would use external TTS service for:', text);
        
        // Simulate audio playback time
        return new Promise((resolve) => {
            const estimatedDuration = text.length * 80; // ~80ms per character
            setTimeout(() => {
                this.updateStatus('Listening...', 'listening');
                resolve();
            }, Math.min(estimatedDuration, 5000)); // Max 5 seconds
        });
    }
    
    updateStatus(text, className) {
        this.statusEl.textContent = text;
        this.statusEl.className = `agent-status status-${className}`;
        
        if (className === 'speaking') {
            this.statusEl.innerHTML = `<span class="speaking-indicator"></span>${text}`;
        }
    }
    
    // Test methods for debugging
    testSpeech() {
        console.log('Testing speech synthesis...');
        this.speak("Hello! This is a test of the AI assistant speech system. Can you hear me in the Zoom meeting?");
    }
    
    testInsight() {
        console.log('Testing meeting insight...');
        const insights = [
            "I'm ready to help with meeting notes and action items.",
            "Feel free to ask me questions or request meeting summaries.",
            "I can assist with capturing key decisions and next steps."
        ];
        const insight = insights[Math.floor(Math.random() * insights.length)];
        this.speak(insight);
    }
}

// Initialize the AI agent when page loads
document.addEventListener('DOMContentLoaded', () => {
    const agent = new MeetingAI();
    window.aiAgent = agent; // Make globally accessible for test buttons
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden');
    } else {
        console.log('Page visible');
    }
});
