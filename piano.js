import { createPiano } from './piano-core.js';
import { WebsimSocket } from 'websim-socket';

// Add error handling to module loading
window.addEventListener('error', (event) => {
    console.error('Unhandled error:', event.error);
    document.getElementById('error-display').textContent = 
        `Error: ${event.error ? event.error.message : 'Unknown error'}`;
});

// Ensure Tone is loaded before initializing
async function initializePiano() {
    if (window.Tone) {
        try {
            // Initialize WebsimSocket room for multiplayer
            const room = new WebsimSocket({
                host: '__PARTYKIT_HOST__',
                room: 'piano-lobby',
            });
            await room.initialize();

            // Create main piano with multiplayer support
            const piano = createPiano(room);
            
            // Listen for effects updates
            room.onmessage = (event) => {
                const data = event.data;
                if (!data || data.clientId === room.clientId) return;
                
                // Handle various event types
                switch(data.type) {
                    case 'samplerUpdate':
                        // This might be where peerAudio.setUseSampler(data.clientId, data.value) could be called
                        // if not handled by presence updates.
                        // Currently, piano-core.js handles useSampler via presence.
                        break;
                    case 'distortionUpdate':
                    case 'reverbUpdate':
                    case 'delayUpdate':
                        const effectName = data.type.replace('Update', '');
                        console.log(`[EFFECTS-TRACE] Piano.js processing ${data.type} from ${data.clientId}, value: ${data.value}`);
                        if (window.updatePeerEffect) {
                            window.updatePeerEffect(data.clientId, effectName, data.value);
                        } else {
                            console.error(`[EFFECTS-TRACE] updatePeerEffect function not available when processing ${data.type}`);
                        }
                        break;
                    // Other event types are handled in piano-core.js's room.onmessage
                }
            };
        } catch (error) {
            console.error('Multiplayer initialization error:', error);
            document.getElementById('error-display').textContent = 
                `Multiplayer Error: ${error.message}`;
        }
    } else {
        console.warn('Waiting for Tone.js to load...');
        setTimeout(initializePiano, 100);
    }
}

// Add a user interaction event to unlock audio context
document.addEventListener('click', () => {
    if (window.Tone && Tone.context.state !== 'running') {
        Tone.start();
    }
}, { once: true });

document.addEventListener('DOMContentLoaded', initializePiano);