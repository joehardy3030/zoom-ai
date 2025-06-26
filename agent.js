document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Starting agent initialization');

    // This guard ensures the script only runs ONCE.
    if (window.agentInitialized) {
        console.log('Agent already initialized. Aborting.');
        return;
    }
    
    // Initialize DOM elements first before making any network calls
    const statusEl = document.getElementById('status');
    const transcriptEl = document.getElementById('transcript');
    
    if (!statusEl || !transcriptEl) {
        console.error('Required DOM elements not found!');
        alert('Error: Required DOM elements not found!');
        return;
    }
    
    // Set initial status
    statusEl.textContent = 'Initializing...';
    
    // --- Get the Bot ID from the URL query parameters ---
    const urlParams = new URLSearchParams(window.location.search);
    const botId = urlParams.get('bot_id');
    
    // --- Get the Backend URL from URL parameters or use a default ---
    const backendUrl = urlParams.get('backend_url') || 'https://75c8-198-27-128-96.ngrok-free.app';
    
    // Mark the agent as initialized now that we have all the parameters
    window.agentInitialized = true;
    console.log('Agent initialized with parameters and ready to start.');
    
    // Enhanced debugging output 
    console.log('=== AGENT DEBUGGING ===');
    console.log(`Full URL: ${window.location.href}`);
    console.log(`Query string: ${window.location.search}`);
    console.log(`Bot ID: ${botId}`);
    console.log(`Backend URL: ${backendUrl}`);
    console.log('All URL Parameters:');
    for (const [key, value] of urlParams.entries()) {
        console.log(`- ${key}: ${value}`);
    }
    
    // Display debug info on the page too for visibility in Zoom
    const addDebugInfo = () => {
        const debugEl = document.createElement('div');
        debugEl.style.position = 'absolute';
        debugEl.style.bottom = '10px';
        debugEl.style.left = '10px';
        debugEl.style.backgroundColor = 'rgba(0,0,0,0.7)';
        debugEl.style.color = '#00ff00';
        debugEl.style.padding = '5px';
        debugEl.style.fontSize = '10px';
        debugEl.style.fontFamily = 'monospace';
        debugEl.style.zIndex = '9999';
        debugEl.innerHTML = `
            Bot ID: ${botId || 'MISSING'}<br>
            Backend: ${backendUrl.substring(0, 30)}...
        `;
        document.body.appendChild(debugEl);
    };
    
    addDebugInfo();

    if (!botId) {
        statusEl.textContent = 'Error: No Bot ID';
        transcriptEl.innerHTML = '<div style="color:red">Error: Missing Bot ID in URL</div>';
        console.error('Bot ID not found in URL query parameters.');
        return;
    }

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
    
    // Update status to show we're ready
    statusEl.textContent = 'Waiting for transcript...';
    
    // JSONP method to bypass CORS
    const getTranscriptJsonp = (callback) => {
        const script = document.createElement('script');
        const callbackName = 'jsonp_callback_' + Date.now();
        
        // Create a global callback function
        window[callbackName] = (data) => {
            console.log(`JSONP received ${data.length} lines`);
            callback(data);
            delete window[callbackName]; // Clean up
            document.body.removeChild(script);
        };
        
        script.src = `${backendUrl}/api/bot/${botId}/transcript?callback=${callbackName}&t=${Date.now()}`;
        script.onerror = () => {
            console.error('JSONP request failed');
            callback([]);
            delete window[callbackName];
            document.body.removeChild(script);
        };
        
        document.body.appendChild(script);
    };
    
    // --- Poll for transcript updates ---
    let lastTimestamp = 0;
    let errorCount = 0;
    const maxErrors = 5;
    
    // Try standard fetch with various fallback methods
    const fetchTranscript = async () => {
        try {
            // Update status to show polling activity
            statusEl.textContent = `Polling... (${new Date().toLocaleTimeString()})`;
            
            try {
                // First try regular fetch
                const fetchUrl = `${backendUrl}/api/bot/${botId}/transcript`;
                console.log(`Fetching transcript from: ${fetchUrl}`);
                
                const response = await fetch(fetchUrl, {
                    mode: 'cors',
                    headers: {
                        'Accept': 'application/json'
                    },
                    cache: 'no-cache'
                });
                
                if (response.ok) {
                    // Reset error count on success
                    errorCount = 0;
                    statusEl.textContent = 'Connected - Regular fetch working';
                    
                    const transcriptLines = await response.json();
                    processTranscript(transcriptLines);
                    return;
                } else {
                    console.log(`Fetch failed with status: ${response.status}`);
                    throw new Error(`HTTP status ${response.status}`);
                }
            } catch (fetchError) {
                console.error('Standard fetch failed, trying JSONP:', fetchError);
                errorCount++;
                
                // Try JSONP as fallback
                getTranscriptJsonp(transcriptLines => {
                    if (transcriptLines && transcriptLines.length > 0) {
                        errorCount = 0;
                        statusEl.textContent = 'Connected - JSONP working';
                        processTranscript(transcriptLines);
                    } else {
                        errorCount++;
                        statusEl.textContent = `Error: No data (Attempt ${errorCount})`;
                    }
                });
            }
        } catch (error) {
            errorCount++;
            console.error(`Error polling for transcript [${errorCount}/${maxErrors}]:`, error);
            statusEl.textContent = `Error: ${error.message} (Attempt ${errorCount})`;
        }
    };
    
    // Process transcript data regardless of how it was fetched
    const processTranscript = (transcriptLines) => {
        console.log(`Received ${transcriptLines.length} lines:`, transcriptLines);
        
        // Filter for new lines that we haven't displayed yet
        const newLines = transcriptLines.filter(line => line.timestamp > lastTimestamp);
        console.log(`Found ${newLines.length} new lines`);

        if (newLines.length > 0) {
            newLines.forEach(line => {
                addMessage(line.speaker, line.text);
            });
            // Update the timestamp of the last message we've seen
            lastTimestamp = newLines[newLines.length - 1].timestamp;
            
            // Ensure we show "connected" status
            statusEl.textContent = 'Connected - Transcript updated';
        }
    };
    
    // Let's try once immediately
    setTimeout(fetchTranscript, 500);
    
    // Then poll every 2 seconds
    setInterval(fetchTranscript, 2000);

    console.log('Visual-only agent is running.');
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    console.log(`Page visibility: ${document.hidden ? 'hidden' : 'visible'}`);
});