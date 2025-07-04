// AI Agent - Dynamic Version Loading
document.addEventListener('DOMContentLoaded', () => {
    console.log('🤖 Agent - Starting initialization');

    // Prevent multiple initializations
    if (window.agentInitialized) {
        console.log('Agent already initialized. Aborting.');
        return;
    }
    window.agentInitialized = true;
    
    // Get DOM elements
    const statusEl = document.getElementById('status');
    const transcriptEl = document.getElementById('transcript');
    const versionEl = document.getElementById('version-info');
    
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
    
    // Load version info
    const loadVersionInfo = async () => {
        try {
            const response = await fetch(`${backendUrl}/api/version`);
            if (response.ok) {
                const versionData = await response.json();
                if (versionEl) {
                    versionEl.textContent = `v${versionData.version} - ${versionData.name}`;
                }
                console.log('Version loaded:', versionData);
                return versionData;
            }
        } catch (error) {
            console.error('Failed to load version:', error);
            if (versionEl) {
                versionEl.textContent = 'Version: Unknown';
            }
        }
        return null;
    };
    
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
    
    // Load version first
    loadVersionInfo();
    
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
        
        // Fallback: Get the exact bot ID that was just deployed
        const tryGetBotIdFromBackend = async () => {
            try {
                console.log('Attempting to get the latest deployed bot ID from backend...');
                
                // First, try to get the exact bot ID that was just deployed
                const latestBotResponse = await fetch(`${backendUrl}/api/latest-bot-id`);
                if (latestBotResponse.ok) {
                    const latestBotData = await latestBotResponse.json();
                    if (latestBotData.success && latestBotData.bot_id) {
                        botId = latestBotData.bot_id;
                        console.log('✅ Using latest deployed bot ID:', botId);
                        statusEl.textContent = 'Using latest deployed bot';
                        document.body.removeChild(earlyDebugEl);
                        initializeAgent();
                        return;
                    }
                }
                
                // Fallback: If no latest bot stored, try to get active bots that have transcript data
                console.log('No latest bot found, checking active bots with transcript data...');
                const activeBotsResponse = await fetch(`${backendUrl}/api/bots`);
                let activeBotIds = [];
                
                if (activeBotsResponse.ok) {
                    const activeBotsData = await activeBotsResponse.json();
                    activeBotIds = Object.keys(activeBotsData.active_bots || {});
                    console.log('Active bots with transcript data:', activeBotIds);
                }
                
                // If we have active bots with transcript data, use the first one
                if (activeBotIds.length > 0) {
                    botId = activeBotIds[0];
                    console.log('✅ Using active bot with transcript data:', botId);
                    statusEl.textContent = 'Using active bot with transcript data';
                    document.body.removeChild(earlyDebugEl);
                    initializeAgent();
                    return;
                }
                
                // Final fallback: Get the most recent bot from Recall API (with proper date parsing)
                console.log('No active bots with transcript data, checking all bots from Recall API...');
                const recallBotsResponse = await fetch(`${backendUrl}/api/recall-bots`);
                if (recallBotsResponse.ok) {
                    const recallData = await recallBotsResponse.json();
                    const allBots = recallData.bots?.results || recallData.bots || [];
                    
                    if (allBots.length > 0) {
                        // Filter out expired bots first
                        const activeBots = allBots.filter(bot => bot.status !== 'media_expired');
                        const botsToSort = activeBots.length > 0 ? activeBots : allBots;
                        
                        // Sort by creation time to get the most recent - with better date handling
                        const sortedBots = botsToSort.sort((a, b) => {
                            const getTimestamp = (bot) => {
                                try {
                                    // Try multiple possible date field names
                                    const dateStr = bot.created_at || bot.created || bot.timestamp || '';
                                    if (dateStr) {
                                        return new Date(dateStr).getTime();
                                    }
                                    return 0;
                                } catch (error) {
                                    console.warn('Date parsing error for bot', bot.id, ':', error);
                                    return 0;
                                }
                            };
                            
                            const timeA = getTimestamp(a);
                            const timeB = getTimestamp(b);
                            return timeB - timeA; // Most recent first
                        });
                        
                        botId = sortedBots[0].id;
                        console.log('✅ Using most recent bot from Recall API:', botId);
                        console.log('Bot status:', sortedBots[0].status);
                        console.log('Bot creation time:', sortedBots[0].created_at || sortedBots[0].created || 'no date');
                        statusEl.textContent = 'Using most recent bot (waiting for transcript data)';
                        document.body.removeChild(earlyDebugEl);
                        initializeAgent();
                        return;
                    }
                }
                
                // If still no bots found, show error
                statusEl.textContent = 'Error: No bots found';
                console.error('No bots found in Recall API');
                earlyDebugEl.innerHTML = `
                    <strong>❌ NO BOTS FOUND</strong><br>
                    Invalid Bot ID: ${botId}<br>
                    Backend: ${backendUrl}<br>
                    No bots found in Recall API
                `;
                
            } catch (error) {
                console.error('Failed to get bot ID from backend:', error);
                statusEl.textContent = 'Error: Bot ID detection failed';
                earlyDebugEl.innerHTML = `
                    <strong>❌ DETECTION FAILED</strong><br>
                    Invalid Bot ID: ${botId}<br>
                    Backend: ${backendUrl}<br>
                    Error: ${error.message}
                `;
            }
        };
        
        // Try to get bot ID after a short delay
        setTimeout(tryGetBotIdFromBackend, 1000);
        return;
    }
    
    // If we have a valid bot ID, initialize immediately
    initializeAgent();
    
    async function initializeAgent() {
        // Audio state
        let currentAudio = null;
        let audioStatus = 'idle';
        let isAudioPlaying = false;
        let transcriptPollingInterval = null;
        let audioPollingInterval = null;
        let lastTimestamp = 0;
        let versionInfo = null;
        
        console.log(`✅ Initializing with Bot ID: ${botId}, Backend: ${backendUrl}`);
        
        // Load version info for debug display
        versionInfo = await loadVersionInfo();
        
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
            const version = versionInfo ? `v${versionInfo.version}` : 'Unknown';
            debugEl.innerHTML = `
                <strong>🔧 DEBUG INFO ${version}</strong><br>
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
        
        const version = versionInfo ? `v${versionInfo.version}` : 'Unknown';
        console.log(`🤖 Agent ${version} initialized with enhanced bot ID handling`);
    }
});

// Handle page visibility
document.addEventListener('visibilitychange', () => {
    console.log(`Page visibility: ${document.hidden ? 'hidden' : 'visible'}`);
});