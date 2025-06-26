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

    // --- Get the Bot ID from the URL query parameters ---
    const urlParams = new URLSearchParams(window.location.search);
    const botId = urlParams.get('bot_id');
    
    // --- Get the Backend URL from URL parameters or use a default ---
    const backendUrl = urlParams.get('backend_url') || 'https://717e-198-27-128-96.ngrok-free.app';
    console.log(`Using backend URL: ${backendUrl}`);

    if (!botId) {
        statusEl.textContent = 'Error: No Bot ID';
        console.error('Bot ID not found in URL query parameters.');
        return;
    }

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
        // Keep the transcript box scrolled to the bottom
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
    };

    // --- Display initial messages just once ---
    transcriptEl.innerHTML = ''; // Clear previous content
    addMessage("AI Assistant", "Hello! I am now connected to the meeting.");
    addMessage("System", `Listening for transcript... (Bot ID: ${botId.substring(0, 8)}...)`);
    
    // --- Poll for transcript updates ---
    let lastTimestamp = 0;
    setInterval(async () => {
        try {
            // Use the absolute URL to the backend instead of a relative URL
            const response = await fetch(`${backendUrl}/api/bot/${botId}/transcript`);
            if (!response.ok) {
                console.error('Failed to fetch transcript:', response.status);
                return;
            }
            
            const transcriptLines = await response.json();
            
            // Filter for new lines that we haven't displayed yet
            const newLines = transcriptLines.filter(line => line.timestamp > lastTimestamp);

            if (newLines.length > 0) {
                newLines.forEach(line => {
                    addMessage(line.speaker, line.text);
                });
                // Update the timestamp of the last message we've seen
                lastTimestamp = newLines[newLines.length - 1].timestamp;
            }

        } catch (error) {
            console.error('Error polling for transcript:', error);
        }
    }, 2000); // Poll every 2 seconds

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