class MeetingAI {
    constructor() {
        this.isListening = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.statusEl = document.getElementById('status');
        this.transcriptEl = document.getElementById('transcript');
        this.conversationContext = [];
        this.isRecallEnvironment = this.detectRecallEnvironment();
        
        this.init();
    }
    
    detectRecallEnvironment() {
        // Detect if running in Recall.ai environment
        // Recall.ai typically runs in a headless browser environment
        return (
            window.navigator.webdriver ||
            !window.navigator.userAgent.includes('Chrome') ||
            window.location.href.includes('recall') ||
            // Other indicators of automated environment
            window.navigator.languages.length === 0
        );
    }
    
    async init() {
        try {
            if (this.isRecallEnvironment) {
                this.setupRecallMode();
            } else {
                this.setupDirectMode();
            }
            
            console.log(`AI Agent initialized in ${this.isRecallEnvironment ? 'Recall.ai' : 'Direct'} mode`);
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.updateStatus('Setup Error', 'error');
        }
    }
    
    setupRecallMode() {
        // Optimized for Recall.ai environment
        this.updateStatus('Ready for Meeting', 'listening');
        
        // Show initial greeting
        setTimeout(() => {
            this.speak("Hello! I'm your AI meeting assistant. I'm here to help with notes, action items, and insights during your meeting.");
        }, 2000);
        
        // Provide periodic check-ins (much less frequent)
        this.setupPeriodicCheckIns();
    }
    
    setupDirectMode() {
        // For direct browser use (with speech recognition)
        this.setupSpeechRecognition();
        this.updateStatus('Listening...', 'listening');
    }
    
    setupPeriodicCheckIns() {
        // Provide helpful check-ins every 5 minutes instead of random events
        let checkInCount = 0;
        const checkInInterval = 5 * 60 * 1000; // 5 minutes
        
        setInterval(() => {
            checkInCount++;
            
            if (checkInCount <= 6) { // Only for first 30 minutes
                const checkIns = [
                    "I'm here if you need help capturing action items or key decisions.",
                    "Feel free to mention my name if you'd like me to summarize any discussion points.",
                    "I can help document important decisions or next steps when you're ready.",
                    "I'm listening and ready to assist with meeting documentation.",
                    "Let me know if you'd like me to highlight any key points from your discussion.",
                    "I'm available to help organize action items or follow-up tasks."
                ];
                
                const checkIn = checkIns[Math.min(checkInCount - 1, checkIns.length - 1)];
                this.speak(checkIn);
            }
        }, checkInInterval);
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
                }, 1500);
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                this.updateStatus('Microphone access denied - switching to Recall mode', 'processing');
                this.setupRecallMode();
            }
        };
        
        this.recognition.onend = () => {
            if (this.isListening) {
                setTimeout(() => this.recognition.start(), 100);
            }
        };
        
        try {
            this.isListening = true;
            this.recognition.start();
        } catch (error) {
            console.warn('Speech recognition not available, using Recall mode');
            this.setupRecallMode();
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
