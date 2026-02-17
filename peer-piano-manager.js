// New file for peer piano management
export function createPeerPianoManager(room, peerAudio) {
    const peerPianos = {};
    const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const peerPianosContainerElement = document.getElementById('peer-pianos');

    function createPeerPiano(clientId) {
        console.log(`[EFFECTS-TRACE] Creating peer piano UI for client ${clientId}`);
        const peerPiano = document.createElement('div');
        peerPiano.id = `peer-piano-${clientId}`;
        peerPiano.classList.add('peer-piano');
        
        const username = room.peers[clientId]?.username || 'Anonymous Player';
        
        const usernameHeader = document.createElement('div');
        usernameHeader.classList.add('peer-header');
        
        const usernameText = document.createElement('h4');
        usernameText.textContent = username;
        usernameHeader.appendChild(usernameText);
        
        const muteButton = document.createElement('button');
        muteButton.classList.add('mute-toggle');
        muteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        muteButton.title = "Mute this piano";
        muteButton.dataset.muted = "false";
        muteButton.addEventListener('click', () => toggleMute(clientId, muteButton));
        usernameHeader.appendChild(muteButton);
        
        peerPiano.appendChild(usernameHeader);
        
        // Create waveform display
        const waveformDisplay = document.createElement('div');
        waveformDisplay.classList.add('waveform-display');
        waveformDisplay.innerHTML = createWaveformSVG();
        peerPiano.appendChild(waveformDisplay);
        
        const peerKeyboard = document.createElement('div');
        peerKeyboard.classList.add('keyboard', 'peer-keyboard');

        // Create keys across all possible octaves that a player might use (with octave shifts)
        for (let octave = 1; octave <= 6; octave++) { 
            NOTES.forEach((note) => {
                const isBlackKey = note.includes('#');
                const keyElement = document.createElement('div');
                
                keyElement.classList.add(
                    isBlackKey ? 'black-key' : 'white-key', 
                    'peer-key'
                );
                keyElement.dataset.note = `${note}${octave}`; 
                
                peerKeyboard.appendChild(keyElement);
            });
        }

        peerPiano.appendChild(peerKeyboard);

        // Add effect sliders to monitor parameter sync
        const effectSliders = document.createElement('div');
        effectSliders.classList.add('peer-effect-sliders');
        
        // Volume slider
        const volumeSlider = createEffectSlider('volume', 'Volume', clientId);
        effectSliders.appendChild(volumeSlider);
        
        // Distortion slider
        const distortionSlider = createEffectSlider('distortion', 'Distortion', clientId);
        effectSliders.appendChild(distortionSlider);
        
        // Reverb slider
        const reverbSlider = createEffectSlider('reverb', 'Reverb', clientId);
        effectSliders.appendChild(reverbSlider);
        
        // Delay slider
        const delaySlider = createEffectSlider('delay', 'Delay', clientId);
        effectSliders.appendChild(delaySlider);
        
        peerPiano.appendChild(effectSliders);

        peerPianosContainerElement.appendChild(peerPiano);
        peerPianos[clientId] = {
            element: peerPiano,
            keyboard: peerKeyboard,
            waveform: waveformDisplay,
            activeNotes: new Set(),
            waveformAnimationId: null,
            effectSliders: {
                volume: volumeSlider.querySelector('input'),
                distortion: distortionSlider.querySelector('input'),
                reverb: reverbSlider.querySelector('input'),
                delay: delaySlider.querySelector('input')
            },
            useSampler: true
        };
    }

    function createEffectSlider(type, label, clientId) {
        const sliderContainer = document.createElement('div');
        sliderContainer.classList.add('peer-effect-slider');
        
        const sliderLabel = document.createElement('label');
        sliderLabel.textContent = label;
        sliderContainer.appendChild(sliderLabel);
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = 0;
        slider.max = 1;
        slider.step = 0.01;
        slider.value = 0;
        slider.disabled = true; // Read-only display
        slider.dataset.type = type;
        slider.dataset.clientId = clientId;
        sliderContainer.appendChild(slider);
        
        return sliderContainer;
    }

    function removePeerPiano(clientId) {
        if (peerPianos[clientId]) {
            peerPianosContainerElement.removeChild(peerPianos[clientId].element);
            delete peerPianos[clientId];
        }
    }

    function highlightPeerNote(clientId, note, isOn) {
        const peerPiano = peerPianos[clientId];
        if (!peerPiano) return;

        // Extract the note name and octave
        const noteMatch = note.match(/([A-G]#?)(\d+)/);
        if (!noteMatch) return;
        
        const [_, noteName, octave] = noteMatch;
        const noteSelector = `[data-note="${noteName}${octave}"]`;
        
        const noteElement = peerPiano.keyboard.querySelector(noteSelector);
        if (noteElement) {
            if (isOn) {
                noteElement.classList.add('active');
                peerPiano.activeNotes.add(note);
                animateWaveform(clientId, true);
            } else {
                noteElement.classList.remove('active');
                peerPiano.activeNotes.delete(note);
                if (peerPiano.activeNotes.size === 0) {
                    animateWaveform(clientId, false);
                }
            }
        } else {
            console.log(`Note element not found for ${note} (selector: ${noteSelector})`);
            // If we can't find the key, it might be outside our visible range
            // Still track the note for waveform animation
            if (isOn) {
                peerPiano.activeNotes.add(note);
                animateWaveform(clientId, true);
            } else {
                peerPiano.activeNotes.delete(note);
                if (peerPiano.activeNotes.size === 0) {
                    animateWaveform(clientId, false);
                }
            }
        }
    }

    function updatePeerVolume(clientId, remoteDbValue) {
        if (!clientId) {
            console.error('updatePeerVolume: No client ID provided');
            return;
        }

        try {
            let peerPiano = peerPianos[clientId];
            if (!peerPiano) {
                console.log(`Creating peer piano for client ${clientId}`);
                createPeerPiano(clientId);
                peerPiano = peerPianos[clientId];
            }

            // Directly use remote volume value without combining with local volume
            peerAudio.updatePeerVolume(
                clientId, 
                null, // No local volume modification
                remoteDbValue // Use remote volume directly
            );
        } catch (error) {
            console.error(`Error updating peer volume for client ${clientId}:`, error);
        }
    }
    
    function toggleMute(clientId, muteButton) {
        const isMuted = muteButton.dataset.muted === "true";
        const newMuteState = !isMuted;
        
        muteButton.dataset.muted = newMuteState.toString();
        
        if (newMuteState) {
            muteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
            muteButton.title = "Unmute this piano";
        } else {
            muteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
            muteButton.title = "Mute this piano";
        }
        
        peerAudio.toggleMute(clientId, newMuteState);
    }

    function hasPeerPiano(clientId) {
        return !!peerPianos[clientId];
    }

    function getPeerPianos() {
        return peerPianos;
    }

    function createWaveformSVG() {
        return `<svg class="waveform-svg" viewBox="0 0 100 20" xmlns="http://www.w3.org/2000/svg">
            <path class="waveform-path" d="M0,10 Q25,10 50,10 T100,10" fill="none" stroke="#00FFAA" stroke-width="3"/>
        </svg>`;
    }

    function animateWaveform(clientId, isPlaying) {
        const peerPiano = peerPianos[clientId];
        if (!peerPiano) return;
        
        const waveformPath = peerPiano.waveform.querySelector('.waveform-path');
        
        if (isPlaying) {
            if (peerPiano.waveformAnimationId) return; // Already animating
            
            let phase = 0;
            const animate = () => {
                phase += 0.2;
                const intensity = Math.min(0.5 + (peerPiano.activeNotes.size * 1), 10);
                const path = generateWaveformPath(phase, intensity);
                waveformPath.setAttribute('d', path);
                peerPiano.waveformAnimationId = requestAnimationFrame(animate);
            };
            
            animate();
        } else {
            if (peerPiano.waveformAnimationId) {
                cancelAnimationFrame(peerPiano.waveformAnimationId);
                peerPiano.waveformAnimationId = null;
            }
            // Reset to straight line
            waveformPath.setAttribute('d', 'M0,10 Q25,10 50,10 T100,10');
        }
    }

    function generateWaveformPath(phase, intensity) {
        const points = [];
        const segments = 10;
        
        for (let i = 0; i <= segments; i++) {
            const x = i * (100 / segments);
            const y = 10 + Math.sin((i / segments * 4 * Math.PI) + phase) * intensity;
            points.push({ x, y });
        }
        
        let path = `M${points[0].x},${points[0].y}`;
        
        for (let i = 1; i < points.length; i++) {
            const cp1x = points[i-1].x + (points[i].x - points[i-1].x) / 3;
            const cp1y = points[i-1].y;
            const cp2x = points[i].x - (points[i].x - points[i-1].x) / 3;
            const cp2y = points[i].y;
            
            path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${points[i].x},${points[i].y}`;
        }
        
        return path;
    }

    function updatePeerEffectSlider(clientId, effect, value) {
        const peerPiano = peerPianos[clientId];
        if (!peerPiano || !peerPiano.effectSliders || !peerPiano.effectSliders[effect]) return;
        
        // Make sure the value is within range
        const normalizedValue = Math.max(0, Math.min(1, value));
        peerPiano.effectSliders[effect].value = normalizedValue;
        
        // The actual audio effect is updated by piano-core.js calling peerAudio.updatePeerSynthEffect.
        // This function is now purely for UI update of the slider.
    }

    function updatePeerSampler(clientId, value) {
        const peerPiano = peerPianos[clientId];
        if (!peerPiano) return;

        peerPiano.useSampler = value;
    }

    return {
        createPeerPiano,
        removePeerPiano,
        highlightPeerNote,
        updatePeerVolume,
        toggleMute,
        hasPeerPiano,
        getPeerPianos,
        updatePeerEffectSlider,
        updatePeerSampler
    };
}