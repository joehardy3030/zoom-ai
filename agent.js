document.addEventListener('DOMContentLoaded', () => {
    // This guard ensures the script only runs ONCE.
    if (window.agentInitialized) {
        console.log('Agent already initialized. Aborting.');
        return;
    }
    window.agentInitialized = true;
    console.log('Initializing visual-only agent...');

    const statusEl = document.getElementById('status');
    const transcriptEl = document.getElementById('transcript');

    if (!statusEl || !transcriptEl) {
        console.error('Required HTML elements not found!');
        return;
    }

    // Set a stable status
    statusEl.textContent = 'AI Assistant Ready';

    // --- Helper function to add messages ---
    const addMessage = (sender, message) => {
        const messageEl = document.createElement('div');
        messageEl.style.marginBottom = '10px';
        messageEl.style.padding = '10px';
        messageEl.style.borderRadius = '8px';
        messageEl.style.backgroundColor = 'rgba(96, 165, 250, 0.2)';
        messageEl.style.border = '1px solid rgba(96, 165, 250, 0.4)';
        
        messageEl.innerHTML = `
            <div style="font-weight: bold; color: #60a5fa; margin-bottom: 4px;">${sender}</div>
            <div style="color: #ffffff; line-height: 1.4;">${message}</div>
        `;
        
        transcriptEl.appendChild(messageEl);
    };

    // --- Display initial messages just once ---
    transcriptEl.innerHTML = ''; // Clear previous content
    addMessage("AI Assistant", "Hello! I am your AI meeting assistant.");
    addMessage("System", "Ready to observe the meeting.");
    
    console.log('Visual-only agent is stable and ready.');
});

// Prevent any accidental reloads or reinitializations
window.addEventListener('load', () => {
    console.log('Window loaded');
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    console.log(`Page visibility: ${document.hidden ? 'hidden' : 'visible'}`);
}); 