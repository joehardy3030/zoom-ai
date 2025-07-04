// AI Agent v1.0.12 - Audio Optimization + Enhanced Bot ID Handling
document.addEventListener('DOMContentLoaded', () => {
    console.log('🤖 Agent v1.0.12 - Starting initialization');

    // Prevent multiple initializations
    if (window.agentInitialized) {
        console.log('Agent already initialized. Aborting.');
        return;
    }
    window.agentInitialized = true;
    
    // Get DOM elements
    const statusEl = document.getElementById('status');
    const transcriptEl = document.getElementById('transcript');
    
    if (!statusEl || !transcriptEl) {
        console.error('Required DOM elements not found!');
        return;
    }
    
    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    let botId = urlParams.get('bot_id');
    const backendUrl = urlParams.get('backend_url');
    
    console.log('Raw URL parameters:', {
        botId: botId,
        backendUrl: backendUrl,
        fullUrl: window.location.href
    });
    
    if (!backendUrl) {
        statusEl.textContent = 'Error: Missing backend URL';
        console.error('Missing backend_url parameter');
        return;
    }
    
    // Enhanced bot ID validation and fallback logic
    const isPlaceholderBotId = (id) => {
        if (!id) return true;
        // Check for various placeholder formats
        const placeholders = [
            '{BOT_ID}', '{{BOT_ID}}', '%7BBOT_ID%7D', 
            '%7B%7BBOT_ID%7D%7D', 'BOT_ID', 'undefined', 'null'
        ];
        return placeholders.includes(id) || id.length < 10;
    };
    
    if (isPlaceholderBotId(botId)) {
        console.warn('Bot ID is placeholder or invalid:', botId);
        statusEl.textContent = 'Detecting Bot ID...';
        
        // Show early debug info
        const earlyDebugEl = document.createElement('div');
        earlyDebugEl.style.cssText = `
            position: absolute; top: 10px; left: 10px; 
            background: rgba(255,0,0,0.9); color: white; 
            padding: 15px; font-size: 16px; font-family: monospace; 
            z-index: 9999; line-height: 1.4; border-radius: 5px;
            border: 2px solid #ff0000; max-width: 400px;
        `;
        earlyDebugEl.innerHTML = `
            <strong>⚠️ FALLBACK MODE</strong><br>
            Invalid Bot ID: ${botId}<br>
            Backend: ${backendUrl}<br>
            Trying fallback...
        `;
        document.body.appendChild(earlyDebugEl);
        
        // Fallback: Try to get bot ID from backend
        const tryGetBotIdFromBackend = async () => {
            try {
                console.log('Attempting to get bot ID from backend...');
                const response = await fetch(`${backendUrl}/api/recall-bots`);
                if (response.ok) {
                    const data = await response.json();
                    const bots = data.bots?.results || data.bots || [];
                    
                    if (bots.length === 1) {
                        botId = bots[0].id;
                        console.log('✅ Found bot ID from backend:', botId);
                        statusEl.textContent = 'Bot ID detected from backend';
                        document.body.removeChild(earlyDebugEl); // Remove red debug box
                        initializeAgent();
                        return;
                    } else if (bots.length > 1) {
                        // Use the most recent bot (first in list)
                        botId = bots[0].id;
                        console.log('✅ Using most recent bot ID:', botId);
                        statusEl.textContent = 'Using most recent bot';
                        document.body.removeChild(earlyDebugEl); // Remove red debug box
                        initializeAgent();
                        return;
                    }
                }
                
                // If we still don't have a valid bot ID, show error
                statusEl.textContent = 'Error: Bot ID not configured properly';
                console.error('Could not determine bot ID');
                addMessage("System", "❌ Bot configuration error - could not detect bot ID");
                
            } catch (error) {
                console.error('Failed to get bot ID from backend:', error);
                statusEl.textContent = 'Error: Bot ID not configured properly';
                addMessage("System", "❌ Bot configuration error - backend unreachable");
            }
        };
        
        // Try to get bot ID after a short delay
        setTimeout(tryGetBotIdFromBackend, 1000);
        return;
    }
    
    // If we have a valid bot ID, initialize immediately
    initializeAgent();
    
    function initializeAgent() {
        // Audio state
        let currentAudio = null;
        let audioStatus = 'idle';
        let isAudioPlaying = false;
        let transcriptPollingInterval = null;
        let audioPollingInterval = null;
        let lastTimestamp = 0;
        
        console.log(`✅ Initializing with Bot ID: ${botId}, Backend: ${backendUrl}`);
        
        // Create debug display - ALWAYS VISIBLE for troubleshooting
        const debugEl = document.createElement('div');
        debugEl.style.cssText = `
            position: absolute; bottom: 10px; left: 10px; 
            background: rgba(0,0,0,0.9); color: #00ff00; 
            padding: 15px; font-size: 16px; font-family: monospace; 
            z-index: 9999; line-height: 1.4; border-radius: 5px;
            border: 2px solid #00ff00; max-width: 400px;
        `;
        document.body.appendChild(debugEl);
        
        // Update debug info
        const updateDebugInfo = () => {
            debugEl.innerHTML = `
                <strong>🔧 DEBUG INFO v1.0.12</strong><br>
                Bot ID: ${botId}<br>
                Backend: ${backendUrl}<br>
                Audio: ${audioStatus} (${isAudioPlaying ? 'Playing' : 'Idle'})<br>
                Screen: ${window.innerWidth}x${window.innerHeight}<br>
                Time: ${new Date().toLocaleTimeString()}<br>
                URL: ${window.location.href.substring(0, 60)}...
            `;
        };
        
        updateDebugInfo();
        setInterval(updateDebugInfo, 3000);
        
        // Message display
        const addMessage = (sender, message) => {
            const messageEl = document.createElement('div');
            messageEl.style.cssText = `
                margin-bottom: 10px; padding: 10px; border-radius: 8px;
                background: rgba(96, 165, 250, 0.2); 
                border: 1px solid rgba(96, 165, 250, 0.4);
            `;
            
            messageEl.innerHTML = `
                <div style="font-weight: bold; color: #60a5fa; margin-bottom: 4px;">${sender}</div>
                <div style="color: #ffffff; line-height: 1.4;">${message}</div>
            `;
            
            transcriptEl.appendChild(messageEl);
            transcriptEl.scrollTop = transcriptEl.scrollHeight;
            
            // Keep only last 20 messages
            while (transcriptEl.children.length > 20) {
                transcriptEl.removeChild(transcriptEl.firstChild);
            }
        };
        
        // Audio functions
        const playAudioFile = async (audioFile) => {
            console.log(`🎵 Playing: ${audioFile}`);
            
            try {
                // Stop current audio
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }
                
                audioStatus = 'loading';
                isAudioPlaying = false;
                addMessage("System", `🎵 Loading: ${audioFile}`);
                
                // Create audio element with immediate playback focus
                currentAudio = new Audio(`${backendUrl}/audio/${audioFile}`);
                currentAudio.preload = 'auto';
                currentAudio.volume = 0.8;
                
                // Simple event listeners for immediate playback
                currentAudio.onloadstart = () => {
                    console.log('🎵 Audio loading started');
                };
                
                currentAudio.oncanplay = () => {
                    console.log('🎵 Audio can play - starting immediately');
                    audioStatus = 'playing';
                    isAudioPlaying = true;
                    addMessage("System", `🎵 Playing: ${audioFile}`);
                    startPolling(); // Restart with reduced frequency
                    currentAudio.play().catch(e => console.error('Play error:', e));
                };
                
                currentAudio.onplaying = () => {
                    console.log('🎵 Audio playing');
                    audioStatus = 'playing';
                    isAudioPlaying = true;
                };
                
                currentAudio.onended = () => {
                    audioStatus = 'idle';
                    isAudioPlaying = false;
                    addMessage("System", `✅ Finished: ${audioFile}`);
                    startPolling(); // Resume normal polling
                };
                
                currentAudio.onerror = (e) => {
                    audioStatus = 'error';
                    isAudioPlaying = false;
                    console.error('Audio error:', e);
                    addMessage("System", `❌ Audio error`);
                    startPolling();
                };
                
                currentAudio.onstalled = () => {
                    console.warn('🎵 Audio stalled - will continue when buffered');
                };
                
                currentAudio.onwaiting = () => {
                    console.warn('🎵 Audio waiting - buffering');
                };
                
                // Start loading immediately
                currentAudio.load();
                
            } catch (error) {
                console.error('Audio error:', error);
                audioStatus = 'error';
                isAudioPlaying = false;
                addMessage("System", `❌ Failed: ${error.message}`);
                startPolling();
            }
        };
        
        const stopAudio = () => {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }
            audioStatus = 'idle';
            isAudioPlaying = false;
            addMessage("System", "🛑 Audio stopped");
            startPolling();
        };
        
        // Polling functions with moderate reduction during audio
        const pollAudioCommands = async () => {
            try {
                const response = await fetch(`${backendUrl}/api/bot/${botId}/audio-command`);
                if (!response.ok) return;
                
                const data = await response.json();
                if (data.command) {
                    console.log('Audio command:', data);
                    if (data.command === 'play' && data.audio_file) {
                        await playAudioFile(data.audio_file);
                    } else if (data.command === 'stop') {
                        stopAudio();
                    }
                }
            } catch (error) {
                console.error('Audio polling error:', error);
            }
        };
        
        const fetchTranscript = async () => {
            try {
                const response = await fetch(`${backendUrl}/api/bot/${botId}/transcript`);
                if (!response.ok) {
                    statusEl.textContent = `Error: ${response.status}`;
                    return;
                }
                
                const data = await response.json();
                if (data && Array.isArray(data)) {
                    processTranscript(data);
                } else {
                    statusEl.textContent = 'Connected - No transcript data';
                }
            } catch (error) {
                console.error('Transcript error:', error);
                statusEl.textContent = `Error: ${error.message}`;
            }
        };
        
        const processTranscript = (transcriptLines) => {
            if (!Array.isArray(transcriptLines) || transcriptLines.length === 0) {
                statusEl.textContent = 'Connected - No transcript data';
                return;
            }
            
            const newLines = transcriptLines.filter(line => {
                return line && line.timestamp && line.speaker && line.text && line.timestamp > lastTimestamp;
            });
            
            if (newLines.length > 0) {
                newLines.forEach(line => {
                    addMessage(line.speaker, line.text);
                });
                lastTimestamp = newLines[newLines.length - 1].timestamp;
                statusEl.textContent = 'Connected - Transcript updated';
            }
        };
        
        // Balanced polling - responsive but not interfering with audio
        const startPolling = () => {
            clearInterval(transcriptPollingInterval);
            clearInterval(audioPollingInterval);
            
            // Moderate reduction during audio playback for balance
            const transcriptInterval = isAudioPlaying ? 8000 : 3000;   // 8s during audio, 3s normally
            const audioInterval = isAudioPlaying ? 12000 : 5000;       // 12s during audio, 5s normally
            
            console.log(`Polling intervals - Transcript: ${transcriptInterval}ms, Audio: ${audioInterval}ms`);
            
            transcriptPollingInterval = setInterval(fetchTranscript, transcriptInterval);
            audioPollingInterval = setInterval(pollAudioCommands, audioInterval);
        };
        
        // Initialize
        statusEl.textContent = 'Initializing...';
        transcriptEl.innerHTML = '';
        addMessage("AI Assistant", "Hello! Connected to the meeting.");
        addMessage("System", `Bot ID: ${botId.substring(0, 8)}...`);
        
        // Start polling
        setTimeout(fetchTranscript, 500);
        setTimeout(pollAudioCommands, 1000);
        startPolling();
        
        console.log('🤖 Agent v1.0.12 initialized with enhanced bot ID handling');
    }
});

// Handle page visibility
document.addEventListener('visibilitychange', () => {
    console.log(`Page visibility: ${document.hidden ? 'hidden' : 'visible'}`);
});