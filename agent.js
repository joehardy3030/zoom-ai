// AI Agent v1.0.9 - Optimized Audio Support
document.addEventListener('DOMContentLoaded', () => {
    console.log('🤖 Agent v1.0.9 - Starting initialization');

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
    const botId = urlParams.get('bot_id');
    const backendUrl = urlParams.get('backend_url');
    
    if (!backendUrl || !botId) {
        statusEl.textContent = 'Error: Missing parameters';
        console.error('Missing bot_id or backend_url');
        return;
    }
    
    // Check if bot ID is still a placeholder (indicates bot setup issue)
    if (botId === '{BOT_ID}' || botId === '{{BOT_ID}}') {
        statusEl.textContent = 'Error: Bot ID not properly configured';
        console.error('Bot ID is still a placeholder - bot setup failed');
        
        // Show error message and stop polling
        addMessage("System", "❌ Bot configuration error - stopping agent");
        return;
    }
    
    // Audio state
    let currentAudio = null;
    let audioStatus = 'idle';
    let isAudioPlaying = false;
    let transcriptPollingInterval = null;
    let audioPollingInterval = null;
    let lastTimestamp = 0;
    
    console.log(`Bot ID: ${botId}, Backend: ${backendUrl}`);
    
    // Create debug display
    const debugEl = document.createElement('div');
    debugEl.style.cssText = `
        position: absolute; bottom: 10px; left: 10px; 
        background: rgba(0,0,0,0.8); color: #00ff00; 
        padding: 10px; font-size: 18px; font-family: monospace; 
        z-index: 9999; line-height: 1.4; border-radius: 5px;
    `;
    document.body.appendChild(debugEl);
    
    // Update debug info
    const updateDebugInfo = () => {
        debugEl.innerHTML = `
            Agent v1.0.9 - Cache Busted<br>
            Bot: ${botId.substring(0, 8)}...<br>
            Backend: ${backendUrl.substring(0, 30)}...<br>
            Audio: ${audioStatus} (${isAudioPlaying ? 'Playing' : 'Idle'})<br>
            Screen: ${window.innerWidth}x${window.innerHeight}<br>
            Time: ${new Date().toLocaleTimeString()}
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
            
            // Reduce polling during audio
            startPolling();
            
            // Create optimized audio element
            currentAudio = new Audio(`${backendUrl}/audio/${audioFile}`);
            currentAudio.preload = 'auto';
            currentAudio.volume = 0.8;
            
            // Event listeners
            currentAudio.onplaying = () => {
                audioStatus = 'playing';
                isAudioPlaying = true;
                addMessage("System", `🎵 Playing: ${audioFile}`);
                startPolling(); // Restart with reduced frequency
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
                addMessage("System", `❌ Audio error`);
                startPolling();
            };
            
            // Play audio
            await currentAudio.play();
            
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
    
    // Polling functions
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
            if (data.transcript && Array.isArray(data.transcript)) {
                processTranscript(data.transcript);
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
    
    // Smart polling with reduced frequency during audio
    const startPolling = () => {
        clearInterval(transcriptPollingInterval);
        clearInterval(audioPollingInterval);
        
        // Reduce polling when audio is playing to minimize choppiness
        const transcriptInterval = isAudioPlaying ? 6000 : 2000;  // 6s during audio, 2s normally
        const audioInterval = isAudioPlaying ? 10000 : 5000;      // 10s during audio, 5s normally
        
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
    
    console.log('🤖 Agent v1.0.9 initialized with optimized audio support');
});

// Handle page visibility
document.addEventListener('visibilitychange', () => {
    console.log(`Page visibility: ${document.hidden ? 'hidden' : 'visible'}`);
});