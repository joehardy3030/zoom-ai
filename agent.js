class MeetingAI {
    constructor() {
        // Prevent multiple instances
        if (window.meetingAIInstance) {
            return window.meetingAIInstance;
        }
        
        this.statusEl = document.getElementById('status');
        this.transcriptEl = document.getElementById('transcript');
        this.isInitialized = false;
        
        // Store instance globally to prevent duplicates
        window.meetingAIInstance = this;
        
        this.init();
    }
    
    async init() {
        if (this.isInitialized) {
            console.log('AI Agent already initialized, skipping...');
            return;
        }
        
        try {
            this.isInitialized = true;
            this.setupVisualOnlyMode();
            console.log('AI Agent initialized in visual-only mode');
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.updateStatus('Setup Error', 'error');
        }
    }
    
    setupVisualOnlyMode() {
        // Simple visual-only mode for Recall.ai
        this.updateStatus('AI Assistant Ready', 'listening');
        
        // Clear any existing content
        this.transcriptEl.innerHTML = '';
        
        // Show initial messages
        this.addMessage("AI Assistant", "Hello! I'm your AI meeting assistant.", "ai");
        this.addMessage("AI Assistant", "I'm ready to help with notes and insights during your meeting.", "ai");
        this.addMessage("System", "Visual-only mode - optimized for Recall.ai", "system");
        
        console.log('AI Agent is ready in visual-only mode');
    }
    
    addMessage(sender, message, type) {
        const messageEl = document.createElement('div');
        messageEl.style.marginBottom = '10px';
        messageEl.style.padding = '12px';
        messageEl.style.borderRadius = '8px';
        messageEl.style.border = '1px solid rgba(255,255,255,0.2)';
        
        if (type === 'ai') {
            messageEl.style.backgroundColor = 'rgba(96, 165, 250, 0.2)';
            messageEl.style.borderColor = 'rgba(96, 165, 250, 0.4)';
        } else if (type === 'system') {
            messageEl.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
            messageEl.style.borderColor = 'rgba(34, 197, 94, 0.4)';
        } else {
            messageEl.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        }
        
        messageEl.innerHTML = `
            <div style="font-weight: bold; color: ${type === 'ai' ? '#60a5fa' : type === 'system' ? '#4ade80' : '#ffffff'}; margin-bottom: 4px;">
                ${sender}
            </div>
            <div style="color: #ffffff; line-height: 1.4;">
                ${message}
            </div>
        `;
        
        this.transcriptEl.appendChild(messageEl);
        
        // Keep only last 8 messages to prevent overflow
        while (this.transcriptEl.children.length > 8) {
            this.transcriptEl.removeChild(this.transcriptEl.firstChild);
        }
        
        // Scroll to bottom
        this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    }
    
    updateStatus(text, className) {
        this.statusEl.textContent = text;
        this.statusEl.className = `agent-status status-${className}`;
    }
}

// Initialize the AI agent when page loads - ONLY ONCE
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing AI agent...');
    if (!window.meetingAIInstance) {
        new MeetingAI();
    }
});

// Prevent any accidental reloads or reinitializations
window.addEventListener('load', () => {
    console.log('Window loaded');
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    console.log(`Page visibility: ${document.hidden ? 'hidden' : 'visible'}`);
}); 