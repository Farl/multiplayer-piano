import { setupEffectsSynchronization, createEffectsChain } from './effects-sync.js';
import { setupOctaveControls } from './octave-handling.js';
import { createPeerAudioSystem } from './peer-audio.js';
import { createPeerPianoManager } from './peer-piano-manager.js';
import { setupManualHandler } from './manual-handler.js';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES = 2;

function createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'sampler-loading-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        color: white;
        text-align: center;
        flex-direction: column;
    `;

    const spinner = document.createElement('div');
    spinner.style.cssText = `
        border: 4px solid #f3f3f3;
        border-top: 4px solid #00FFAA;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
    `;

    const message = document.createElement('p');
    message.textContent = 'Loading High-Quality Piano Samples...';
    message.style.cssText = `
        margin-top: 20px;
        font-size: 1.2rem;
        color: #00FFAA;
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;

    overlay.appendChild(spinner);
    overlay.appendChild(message);
    document.body.appendChild(overlay);
    document.head.appendChild(style);

    return overlay;
}

export function createPiano(room) {
    async function setupPiano() {
        const toneReady = await initializeTone();
        if (!toneReady) return;

        const samplerLoadingOverlay = createLoadingOverlay();
        samplerLoadingOverlay.style.display = 'flex'; // Show loading overlay immediately

        // Add sustain functionality variables
        let sustainActive = false;
        const sustainedNotes = [];

        const mainSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: 'custom',
                partials: [1, 0.7, 0.5, 0.3, 0.2, 0.1],
                phase: 0,
                harmonicity: 1.005
            },
            envelope: {
                attack: 0.01,
                decay: 1.0,
                sustain: 0.1,
                release: 1.0
            },
            volume: -4
        });

        const sampler = new Tone.Sampler({
            urls: {
                A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
                A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
                A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
                A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
                A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
                A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
                A6: "A6.mp3", C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
                A7: "A7.mp3", C8: "C8.mp3"
            },
            release: 1,
            baseUrl: "https://tonejs.github.io/audio/salamander/",
            onload: () => {
                console.log("Sampler loaded successfully");
                samplerLoadingOverlay.style.display = 'none'; // Hide loading overlay
                document.getElementById('sound-toggle').disabled = false;
            },
            onprogress: (progress) => {
                console.log(`Sampler loading progress: ${progress * 100}%`);
            },
            onerror: (error) => {
                console.error("Error loading sampler:", error);
                samplerLoadingOverlay.style.display = 'none';
                document.getElementById('error-display').textContent =
                    'Failed to load piano samples. Using synthesized sounds.';
            }
        });

        let currentInstrument = sampler;

        const soundToggle = document.getElementById('sound-toggle');

        function setUseSampler(usesSampler)
        {
            currentInstrument = usesSampler ? sampler : mainSynth;
            soundToggle.textContent = !usesSampler ? " Synth" : " Sampler";
            soundToggle.classList.toggle('using-sampler', usesSampler);
            room.updatePresence({useSampler:usesSampler})
        }
        setUseSampler(true);
        soundToggle.disabled = true; // Disabled until sampler loads
        soundToggle.addEventListener('click', () => {setUseSampler(currentInstrument !== sampler)});

        const keyboard = document.getElementById('keyboard');
        const volumeSlider = document.getElementById('volume-slider');
        const distortionSlider = document.getElementById('distortion-slider');
        const reverbSlider = document.getElementById('reverb-slider');
        const delaySlider = document.getElementById('delay-slider');
        const peerPianosContainer = document.getElementById('peer-pianos');

        const synthOptions = {
            oscillator: {
                type: 'custom',
                partials: [1, 0.7, 0.5, 0.3, 0.2, 0.1],
                phase: 0,
                harmonicity: 1.005
            },
            envelope: {
                attack: 0.002,
                decay: 0.5,
                sustain: 0.6,
                release: 2.0
            },
            volume: 0
        };

        const MIN_DB = -12;
        const MAX_DB = 12;
        const DEFAULT_DB = 6;

        function calculateVolumeFromSlider(sliderValue) {
            return MIN_DB + ((sliderValue ** 2) * (MAX_DB - MIN_DB));
        }

        function calculateSliderFromVolume(dbValue) {
            return Math.sqrt((dbValue - MIN_DB) / (MAX_DB - MIN_DB));
        }

        function updateVolumeDisplay(slider, dbValue) {
            const label = slider.closest('label');
            if (!label) return;

            const volumeSpan = label.querySelector('span');
            if (!volumeSpan) return;

            volumeSpan.textContent = `Volume (${dbValue.toFixed(1)} dB)`;
        }

        function updateVolume(sliderValue) {
            const dbValue = calculateVolumeFromSlider(sliderValue);
            currentInstrument.volume.setValueAtTime(dbValue, Tone.now());
            updateVolumeDisplay(volumeSlider, dbValue);

            room.send({
                type: 'volumeUpdate',
                dbValue: dbValue
            });

            room.updatePresence({
                volumeValue: dbValue,
                volumeRange: {min: MIN_DB, max: MAX_DB}
            });
        }

        const masterVolume = new Tone.Gain(1);
        const volumeNode = new Tone.Volume(0);

        const { distortion, reverb, pingPongDelay } = createEffectsChain(sampler, mainSynth, volumeNode, masterVolume);

        const masterVolumeSlider = document.getElementById('master-volume-slider');

        masterVolumeSlider.addEventListener('input', (e) => {
            const sliderValue = parseFloat(e.target.value); // sliderValue is from 0 to 1

            const minGain_dB = -70;
            const maxGain_dB = 0; // Max gain is 0dB (linear gain 1)

            const minGain_linear = Math.pow(10, minGain_dB / 20);
            const maxGain_linear = Math.pow(10, maxGain_dB / 20); // This is 1

            // Linear interpolation of gain based on slider position
            const mappedGain = minGain_linear + sliderValue * (maxGain_linear - minGain_linear);

            masterVolume.gain.value = mappedGain;
        });

        setupEffectsSynchronization(
            room, distortion, reverb, pingPongDelay,
            distortionSlider, reverbSlider, delaySlider
        );

        const peerAudio = createPeerAudioSystem(masterVolume);

        window.peerAudio = peerAudio;

        setupManualHandler();

        volumeSlider.min = 0;
        volumeSlider.max = 1;
        volumeSlider.step = 0.01;
        volumeSlider.value = calculateSliderFromVolume(DEFAULT_DB);

        volumeSlider.addEventListener('input', (e) => {
            const sliderValue = parseFloat(e.target.value);
            updateVolume(sliderValue);
        });

        updateVolumeDisplay(volumeSlider, DEFAULT_DB);
        updateVolume(volumeSlider.value);

        const keyboardMap = {
            'a': 'C3',
            's': 'D3',
            'd': 'E3',
            'f': 'F3',
            'g': 'G3',
            'h': 'A3',
            'j': 'B3',
            'k': 'C4',
            'l': 'D4',
            ';': 'E4',
            'm': 'F4',
            ',': 'G4',
            '.': 'A4',
            '/': 'B4',
            'w': 'C#3',
            'e': 'D#3',
            't': 'F#3',
            'y': 'G#3',
            'u': 'A#3',
            'i': 'C#4',
            'o': 'D#4',
            'p': 'F#4',
            '[': 'G#4',
            ']': 'A#4'
        };

        const MIN_OCTAVE = -2;
        const MAX_OCTAVE = 2;

        const octaveController = setupOctaveControls(
            keyboard,
            currentInstrument,
            room,
            MIN_OCTAVE,
            MAX_OCTAVE,
            keyboardMap
        );

        const originalSetUseSampler = setUseSampler;
        setUseSampler = (usesSampler) => {
            originalSetUseSampler(usesSampler);
            octaveController.mainSynth = currentInstrument;
        };

        // Map to track active touches by their identifier
        const activeTouches = new Map();

        const activateKey = (keyElement) => {
            // Use original note for tracking active sounding notes from this client
            const originalNote = keyElement.dataset.originalNote || keyElement.dataset.note;
            
            // Only activate if this note isn't already sounding from a different input (e.g. multiple fingers on same note)
            if (!octaveController.getActiveNotes().has(originalNote)) {
                // The note to play/send is the transposed/shifted one from the dataset
                const soundingNote = keyElement.dataset.note; 
                
                keyElement.classList.add('active'); // Visual feedback
                currentInstrument.triggerAttack(soundingNote);
                octaveController.addActiveNote(originalNote); // Track the original mapped note
                room.send({
                    type: 'noteOn',
                    note: soundingNote,
                    useSampler: currentInstrument === sampler
                });
            }
        };

        const deactivateKey = (keyElement) => {
             // Use original note for tracking active sounding notes from this client
             const originalNote = keyElement.dataset.originalNote || keyElement.dataset.note; 
             
             // Only deactivate if this note was actually triggered by a local input and is still sounding
             if (octaveController.getActiveNotes().has(originalNote)) { 
                // The note to release/send is the transposed/shifted one from the dataset
                const soundingNote = keyElement.dataset.note; 

                keyElement.classList.remove('active'); // Visual feedback
                octaveController.removeActiveNote(originalNote); // Remove the original mapped note from tracking
                
                // If sustain is active, don't release the note audio but add to sustained notes
                if (sustainActive) {
                    sustainedNotes.push(soundingNote);
                } else {
                    currentInstrument.triggerRelease(soundingNote);
                    room.send({
                        type: 'noteOff',
                        note: soundingNote,
                        useSampler: currentInstrument === sampler
                    });
                }
             }
        };


        for (let octave = 0; octave < OCTAVES; octave++) {
            NOTES.forEach((note, index) => {
                const isBlackKey = note.includes('#');
                const keyElement = document.createElement('div');

                keyElement.classList.add(isBlackKey ? 'black-key' : 'white-key');
                keyElement.dataset.note = `${note}${octave + 3}`;
                // Store the original note mapping on the element
                keyElement.dataset.originalNote = `${note}${octave + 3}`;


                const keyboardKey = Object.keys(keyboardMap).find(
                    key => keyboardMap[key] === keyElement.dataset.originalNote // Use originalNote here
                );

                const keyLabel = document.createElement('span');
                keyLabel.classList.add('key-label');
                if (keyboardKey) {
                    keyLabel.textContent = `${keyboardKey.toUpperCase()}\r\n${note}${octave + 3}`;
                }
                else {
                    keyLabel.textContent = `\r\n${note}${octave + 3}`;
                }
                keyElement.appendChild(keyLabel);


                // --- Mouse Event Handling ---

                keyElement.addEventListener('mousedown', (event) => {
                    if (event.button === 0) { // Left mouse button only
                        event.preventDefault(); // Prevent default click behavior (e.g., selection)
                        activateKey(keyElement);
                    }
                });

                keyElement.addEventListener('mouseup', (event) => {
                    if (event.button === 0) { // Left mouse button only
                        event.preventDefault();
                         // Check if the note is still active before deactivating
                         const originalNote = keyElement.dataset.originalNote;
                         if (octaveController.getActiveNotes().has(originalNote)) {
                           deactivateKey(keyElement);
                         }
                    }
                });

                // mouseenter and mouseleave handle dragging across keys
                keyElement.addEventListener('mouseenter', (event) => {
                     // Check if primary mouse button is down for drag-across
                    if (event.buttons === 1) {
                         activateKey(keyElement);
                    }
                 });

                keyElement.addEventListener('mouseleave', (event) => {
                     // If the left mouse button is down, trigger release when leaving
                    if (event.buttons === 1) {
                       const originalNote = keyElement.dataset.originalNote;
                       // Only deactivate if this note was active before leaving
                       if (octaveController.getActiveNotes().has(originalNote)) {
                          deactivateKey(keyElement);
                       }
                    }
                 });


                // --- Touch Event Handling ---

                keyElement.addEventListener('touchstart', (event) => {
                    event.preventDefault(); // Prevent default behavior like scrolling/zooming
                    // Handle multiple touches if needed, but typically one finger per note/key is expected for sliding
                    for (let i = 0; i < event.changedTouches.length; i++) {
                        const touch = event.changedTouches[i];
                        const touchId = touch.identifier;
                        // Check if this touch is already being tracked (shouldn't happen on touchstart, but safe check)
                        if (!activeTouches.has(touchId)) {
                            activeTouches.set(touchId, keyElement);
                            activateKey(keyElement);
                        }
                    }
                });


                // Append key element to the keyboard container
                keyboard.appendChild(keyElement);
            });
        }

        // --- Global Touchmove Handler on Keyboard ---
        keyboard.addEventListener('touchmove', (event) => {
            event.preventDefault(); // Prevent scrolling
            const changedTouches = event.changedTouches;

            for (let i = 0; i < changedTouches.length; i++) {
                const touch = changedTouches[i];
                const touchId = touch.identifier;
                const targetElement = document.elementFromPoint(touch.clientX, touch.clientY); // Find element under touch

                const currentKeyElement = activeTouches.get(touchId);

                // Check if the target element is a piano key and different from the current one
                const newKeyElement = targetElement ? targetElement.closest('.white-key, .black-key') : null;

                if (newKeyElement && newKeyElement !== currentKeyElement) {
                    // Finger moved onto a new key
                    if (currentKeyElement) {
                        // Finger left the previous key - deactivate it
                        deactivateKey(currentKeyElement);
                    }
                    // Activate the new key
                    activateKey(newKeyElement);
                    activeTouches.set(touchId, newKeyElement); // Update tracking
                } else if (!newKeyElement && currentKeyElement) {
                    // Finger moved off the keyboard or off a key onto a non-key element
                     // Deactivate the key the touch was just on
                     deactivateKey(currentKeyElement);
                     activeTouches.delete(touchId); // Stop tracking this touch until it hits a key again
                }
                // If newKeyElement is the same as currentKeyElement, or if no key is found and no key was tracked, do nothing.
            }
        });

        // --- Global Touchend/Touchcancel Handler on Document ---
        // Need to listen globally in case the touch ends outside the keyboard
        document.addEventListener('touchend', handleTouchEndCancel);
        document.addEventListener('touchcancel', handleTouchEndCancel); // Handle interruptions

        function handleTouchEndCancel(event) {
            // Don't prevent default here globally, as it might affect other elements outside the piano
            // event.preventDefault();

            const changedTouches = event.changedTouches;

            for (let i = 0; i < changedTouches.length; i++) {
                const touch = changedTouches[i];
                const touchId = touch.identifier;
                const keyElement = activeTouches.get(touchId);

                if (keyElement) {
                    // Touch ended on a key or after moving off a key - deactivate the last tracked key
                    deactivateKey(keyElement);
                    activeTouches.delete(touchId); // Remove tracking
                }
            }
        }

        const sustainButton = document.getElementById('sustain-button');

        function setSustainState(isActive) {
            sustainActive = isActive;
            sustainButton.classList.toggle('active', isActive);
            
            if (!isActive) {
                //console.log({sustainedNotes});
                // Release all sustained notes when deactivating
                sustainedNotes.forEach(note => {
                    currentInstrument.triggerRelease(note);
                    room.send({
                        type: 'noteOff',
                        note: note,
                        useSampler: currentInstrument === sampler
                    });
                });
                sustainedNotes.length = 0;
            }
        }

        // --- Keyboard Event Handling ---

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Activate sustain when Space key is pressed
            if (e.key === ' ' && !sustainActive) {
                setSustainState(true);
                // Prevent scrolling when space is pressed
                e.preventDefault(); 
                return;
            }
            
            if (e.repeat) return; // Prevent repeating key presses

            const keyboardMap = octaveController.getOverrideKeyboardMap();
            const originalMappedNote = keyboardMap[e.key.toLowerCase()]; // This is the original mapped note like 'C3'

            // Find the corresponding key element using data-original-note
            const keyElement = originalMappedNote ? document.querySelector(`[data-original-note="${originalMappedNote}"]`) : null;

            // Only trigger if a note is mapped AND that original note isn't currently active from keyboard input
            if (originalMappedNote && keyElement && !octaveController.getActiveNotes().has(originalMappedNote)) {
                // The note to play/send is the transposed/shifted one from the key element's dataset.note
                const soundingNote = keyElement.dataset.note;

                keyElement.classList.add('active'); // Visual feedback
                currentInstrument.triggerAttack(soundingNote);
                octaveController.addActiveNote(originalMappedNote); // Add the original mapped note to tracking

                room.send({
                    type: 'noteOn',
                    note: soundingNote,
                    useSampler: currentInstrument === sampler
                });
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Deactivate sustain when Space key is released
            if (e.key === ' ' && sustainActive) {
                setSustainState(false);
                // Allow default space behavior (e.g., click a focused button) after release
                // e.preventDefault(); // Don't prevent default here on keyup
                return;
            }

            const keyboardMap = octaveController.getOverrideKeyboardMap();
            const originalMappedNote = keyboardMap[e.key.toLowerCase()]; // This is the original mapped note like 'C3'

             // Find the corresponding key element using data-original-note
             const keyElement = originalMappedNote ? document.querySelector(`[data-original-note="${originalMappedNote}"]`) : null;

             // Only trigger if a note is mapped AND that original note IS currently active from keyboard input
            if (originalMappedNote && keyElement && octaveController.getActiveNotes().has(originalMappedNote)) {
                 // The note to release/send is the transposed/shifted one from the key element's dataset.note
                const soundingNote = keyElement.dataset.note;

                keyElement.classList.remove('active'); // Visual feedback
                octaveController.removeActiveNote(originalMappedNote); // Remove the original mapped note from tracking
                
                // If sustain is active, don't release the note audio but add to sustained notes
                if (sustainActive) {
                    sustainedNotes.push(soundingNote);
                } else {
                    currentInstrument.triggerRelease(soundingNote);
                    room.send({
                        type: 'noteOff',
                        note: soundingNote,
                        useSampler: currentInstrument === sampler
                    });
                }
            }
        });

        sustainButton.addEventListener('click', () => {
            setSustainState(!sustainActive);
        });

        // Add touch handling for mobile devices
        sustainButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            setSustainState(!sustainActive);
        });

        const peerPianoManager = createPeerPianoManager(room, peerAudio);

        room.onmessage = (event) => {
            const data = event.data;
            const senderId = data.clientId;

            if (senderId === room.clientId) return;

            switch (data.type) {
                case 'noteOn':
                    // Note: highlightPeerNote expects the actual sounding note (e.g., C4)
                    peerPianoManager.highlightPeerNote(senderId, data.note, true);
                    peerAudio.playPeerNote(senderId, data.note, synthOptions, data.useSampler);
                    break;
                case 'noteOff':
                    // Note: highlightPeerNote expects the actual sounding note (e.g., C4)
                    peerPianoManager.highlightPeerNote(senderId, data.note, false);
                    peerAudio.stopPeerNote(senderId, data.note);
                    break;
                case 'volumeUpdate':
                    // Handled by presence
                    break;
                case 'samplerUpdate':
                    // Handled by presence
                    break;
                case 'distortionUpdate':
                case 'reverbUpdate':
                case 'delayUpdate':
                    const effectName = data.type.replace('Update', '');
                    console.log(`[EFFECTS-TRACE] Piano-core.js (onmessage) processing ${data.type} from ${senderId}, value: ${data.value}`);
                    if (peerAudio && peerAudio.updatePeerSynthEffect) {
                        peerAudio.updatePeerSynthEffect(senderId, effectName, data.value);
                    }
                    if (peerPianoManager && peerPianoManager.updatePeerEffectSlider) {
                        peerPianoManager.updatePeerEffectSlider(senderId, effectName, data.value);
                    }
                    break;
            }
        };

        room.subscribePresence((presence) => {
            Object.keys(presence).forEach(clientId => {
                if (clientId === room.clientId) return;

                const peerPresence = presence[clientId];

                if (!peerPianoManager.hasPeerPiano(clientId)) {
                    console.log(`Creating peer piano UI for new client: ${clientId}`);
                    peerPianoManager.createPeerPiano(clientId);
                    // Ensure audio components are created if they don't exist,
                    // using presence data for initial state (e.g., useSampler).
                    if (!window.peerSynths || !window.peerSynths[clientId]) {
                        console.log(`[EFFECTS-TRACE] Ensuring peer audio components exist for ${clientId} due to presence update.`);
                        const initialUseSampler = peerPresence.useSampler !== undefined ? peerPresence.useSampler : false; // Default to synth if not specified
                        peerAudio.createPeerSynth(clientId, synthOptions, initialUseSampler);
                    }
                }

                if (peerPresence.volumeValue !== undefined) {
                    const remoteVolumeValue = peerPresence.volumeValue;
                    peerAudio.updatePeerVolume(clientId, null, remoteVolumeValue, synthOptions);

                    // Calculate slider value based on the remote volume using the same formula as local
                    const sliderValueForPeerVolume = calculateSliderFromVolume(remoteVolumeValue);
                    // Update the peer's volume slider in the UI. This slider is just a display, not interactive.
                    peerPianoManager.updatePeerEffectSlider(clientId, 'volume', sliderValueForPeerVolume);
                }

                if (peerPresence.useSampler !== undefined) {
                    // Ensure audio components are created if they don't exist before setting sampler state
                     if (!window.peerSynths || !window.peerSynths[clientId]) {
                        console.log(`[EFFECTS-TRACE] Creating peer audio for ${clientId} before setting sampler from presence.`);
                        peerAudio.createPeerSynth(clientId, synthOptions, peerPresence.useSampler);
                    }
                    peerAudio.setUseSampler(clientId, peerPresence.useSampler);
                    peerPianoManager.updatePeerSampler(clientId, peerPresence.useSampler); // UI update
                }

                // Ensure audio components exist before trying to update effects
                if (!window.peerSynths || !window.peerSynths[clientId]) {
                     console.warn(`[EFFECTS-TRACE] Peer audio for ${clientId} not found during effect update from presence. Attempting creation.`);
                     const initialUseSamplerForEffectUpdate = peerPresence.useSampler !== undefined ? peerPresence.useSampler : false;
                     peerAudio.createPeerSynth(clientId, synthOptions, initialUseSamplerForEffectUpdate);
                }

                if (peerPresence.distortionValue !== undefined) {
                    if (peerAudio.updatePeerSynthEffect) peerAudio.updatePeerSynthEffect(clientId, 'distortion', peerPresence.distortionValue);
                    peerPianoManager.updatePeerEffectSlider(clientId, 'distortion', peerPresence.distortionValue);
                }

                if (peerPresence.reverbValue !== undefined) {
                    if (peerAudio.updatePeerSynthEffect) peerAudio.updatePeerSynthEffect(clientId, 'reverb', peerPresence.reverbValue);
                    peerPianoManager.updatePeerEffectSlider(clientId, 'reverb', peerPresence.reverbValue);
                }

                if (peerPresence.delayValue !== undefined) {
                     if (peerAudio.updatePeerSynthEffect) peerAudio.updatePeerSynthEffect(clientId, 'delay', peerPresence.delayValue);
                    peerPianoManager.updatePeerEffectSlider(clientId, 'delay', peerPresence.delayValue);
                }
            });

            Object.keys(peerPianoManager.getPeerPianos()).forEach(clientId => {
                if (!presence[clientId]) {
                    console.log(`Removing peer piano UI for disconnected client: ${clientId}`);
                    peerPianoManager.removePeerPiano(clientId);
                    if (window.peerSynths && window.peerSynths[clientId]) {
                        try {
                            window.peerSynths[clientId].synth.dispose();
                            window.peerSynths[clientId].sampler.dispose();
                            window.peerSynths[clientId].volumeNode.dispose();
                            Object.values(window.peerSynths[clientId].effects).forEach(effect => effect.dispose());
                            delete window.peerSynths[clientId];
                            console.log(`Disposed audio resources for peer ${clientId}`);
                        } catch (e) {
                            console.error(`Error disposing resources for peer ${clientId}:`, e);
                        }
                    }
                }
            });
        });

        async function initializeTone() {
            try {
                await Tone.start();
                console.log('Audio context started');
            } catch (error) {
                console.error('Failed to start audio context:', error);
                document.getElementById('error-display').textContent = 'Audio initialization failed';
                return false;
            }
            return true;
        }
    }
    setupPiano();
}