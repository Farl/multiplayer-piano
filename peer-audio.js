// New file for peer audio handling
export function createPeerAudioSystem(masterVolumeNode) {
    // Make peerSynths accessible globally for debugging or specific inter-module calls if absolutely necessary
    // but prefer explicit function calls.
    window.peerSynths = {}; 
    const peerSynths = window.peerSynths;
    const DEFAULT_DB = 6;
    const MIN_DB = 0;
    const MAX_DB = 12;

    function calculateVolumeFromSlider(sliderValue) {
        return MIN_DB + ((sliderValue ** 2) * (MAX_DB - MIN_DB));
    }

    function calculateSliderFromVolume(dbValue) {
        return Math.sqrt((dbValue - MIN_DB) / (MAX_DB - MIN_DB));
    }

    function createPeerSynth(clientId, synthOptions, initialUseSampler = false) {
        let synth = new Tone.PolySynth(Tone.Synth, { ...synthOptions });
        let sampler = new Tone.Sampler({
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
            volume: -6, // Sampler internal volume, peerVolumeNode is master for this peer
            // onload/onerror can be added if needed for individual peer samplers
        });
        
        const volumeNode = new Tone.Volume(0);  

        // Create dedicated effect instances for this peer
        // Mirroring local player's effect base parameters for consistency
        const peerDistortion = new Tone.Distortion(0.8); // Amount: 0.8 (same as local)
        peerDistortion.wet.value = 0;

        const peerReverb = new Tone.Reverb(3); // Decay: 3s (same as local)
        peerReverb.wet.value = 0;
        // Initialize reverb (asynchronous operation)
        peerReverb.generate().then(() => {
            console.log(`[EFFECTS-TRACE] Reverb for peer ${clientId} generated successfully.`);
        }).catch(err => {
            console.error(`[EFFECTS-TRACE] Error generating reverb for peer ${clientId}:`, err);
        });
        
        const peerDelay = new Tone.PingPongDelay("8n", 0.5); // DelayTime: "8n", Feedback: 0.5 (same as local)
        peerDelay.wet.value = 0;

        peerSynths[clientId] = {
            synth: synth,
            sampler: sampler,
            volumeNode: volumeNode,
            muted: false,
            localVolume: DEFAULT_DB, 
            remoteVolume: DEFAULT_DB, 
            effects: {
                distortion: peerDistortion,
                reverb: peerReverb,
                delay: peerDelay,
            },
            useSampler: initialUseSampler 
        };
        
        // Connect the initial instrument to the volume node
        const initialInstrument = initialUseSampler ? sampler : synth;
        initialInstrument.connect(volumeNode);
        
        // Connect the volume node to the peer's dedicated effects chain
        volumeNode.connect(peerDistortion);
        peerDistortion.connect(peerReverb);
        peerReverb.connect(peerDelay);
        peerDelay.connect(masterVolumeNode); // Connect to the shared master volume node
        
        console.log(`[EFFECTS-TRACE] Created peer synth for ${clientId}, useSampler: ${initialUseSampler}. Effects chain established and connected to master volume.`);
    }

    function playPeerNote(clientId, note, synthOptions, useSamplerForCreationHint) {
        if (!peerSynths[clientId]) {
            // If synth doesn't exist, create it using the useSampler hint from the noteOn event.
            createPeerSynth(clientId, synthOptions, useSamplerForCreationHint);
        }
        
        const peer = peerSynths[clientId];
        // Play on the instrument that is currently connected according to peer.useSampler state
        const instrumentToPlay = peer.useSampler ? peer.sampler : peer.synth;
        instrumentToPlay.triggerAttack(note);
        
        console.log(`[EFFECTS-TRACE] Triggering attack for note ${note} on peer ${clientId} (useSampler state: ${peer.useSampler})`);
    }

    function stopPeerNote(clientId, note) {
        const peer = peerSynths[clientId];
        if (peer) {
            // Stop on the instrument that is currently connected according to peer.useSampler state
            const instrumentToStop = peer.useSampler ? peer.sampler : peer.synth;
            instrumentToStop.triggerRelease(note);
            console.log(`[EFFECTS-TRACE] Triggering release for note ${note} on peer ${clientId} (useSampler state: ${peer.useSampler})`);
        }
    }
    
    function updatePeerSynthEffect(clientId, effectName, value) {
        const peer = peerSynths[clientId];
        if (peer && peer.effects && peer.effects[effectName]) {
            // Ensure the effect instance exists and has a 'wet' property
            if (peer.effects[effectName].wet) {
                 peer.effects[effectName].wet.value = value;
                 console.log(`[EFFECTS-TRACE] Updated peer ${clientId} ${effectName} wet value to ${value}`);
            } else {
                console.warn(`[EFFECTS-TRACE] Effect ${effectName} for peer ${clientId} does not have a 'wet' property.`);
            }
        } else {
            console.warn(`[EFFECTS-TRACE] Could not update effect ${effectName} for peer ${clientId}. Peer, effects object, or specific effect not found.`);
        }
    }

    function updatePeerVolume(clientId, localDbValue, remoteDbValue, synthOptions) {
        if (!clientId) {
            console.error('updatePeerVolume: No client ID provided');
            return;
        }

        if (!peerSynths[clientId]) {
            // If called before synth created, it implies we need a default synth.
            // However, playPeerNote is primary creator. This path might need initialUseSampler if it creates.
            // For now, assume synth exists or this call is primarily for existing synths.
            // Let's ensure createPeerSynth is called if needed, using a default initialUseSampler.
            createPeerSynth(clientId, synthOptions, false); // Default to synth if created here.
        }

        const peer = peerSynths[clientId];
        peer.localVolume = localDbValue !== undefined ? localDbValue : peer.localVolume;
        peer.remoteVolume = remoteDbValue !== undefined ? remoteDbValue : peer.remoteVolume;

        const combinedVolume = remoteDbValue;  // remoteDbValue is peer's own volume setting
        
        if (!peer.muted) {
            peer.volumeNode.volume.setValueAtTime(combinedVolume, Tone.now());
            console.log(`[EFFECTS-TRACE] Applied volume to peer ${clientId}: localDb=${peer.localVolume}, remoteDb=${peer.remoteVolume}, combinedDb=${combinedVolume}`);
        }

        return {
            combinedDbValue: combinedVolume,
            sliderValue: calculateSliderFromVolume(localDbValue) // localDbValue used for local UI slider representing peer's volume
        };
    }

    function toggleMute(clientId, muteState) {
        const peer = peerSynths[clientId];
        if (!peer) return;
        
        peer.muted = muteState;
        
        if (muteState) {
            peer.volumeNode.volume.setValueAtTime(-Infinity, Tone.now());
        } else {
            const combinedVolume = peer.remoteVolume; // Use peer's own volume setting
            peer.volumeNode.volume.setValueAtTime(combinedVolume, Tone.now());
        }
        
        return muteState;
    }

    function setUseSampler(clientId, shouldUseSampler) {
        const peer = peerSynths[clientId];
        if (!peer) {
            console.warn(`[EFFECTS-TRACE] setUseSampler called for non-existent peer ${clientId}. This preference should be applied upon creation.`);
            // Ideally, presence update also triggers creation if not existing, passing this preference.
            // For now, if createPeerSynth isn't called by presence handler, this might be missed for new peers until first note.
            return;
        }

        if (peer.useSampler === shouldUseSampler) return; // No change needed

        const oldInstrument = peer.useSampler ? peer.sampler : peer.synth;
        const newInstrument = shouldUseSampler ? peer.sampler : peer.synth;

        // Disconnect old, connect new to the volumeNode.
        // The volumeNode is already part of this peer's dedicated effects chain.
        oldInstrument.disconnect(peer.volumeNode);
        newInstrument.connect(peer.volumeNode);
        
        peer.useSampler = shouldUseSampler; // Update the stored state
        console.log(`[EFFECTS-TRACE] Peer ${clientId} instrument switched. Now useSampler: ${shouldUseSampler}`);
    }

    return {
        playPeerNote,
        stopPeerNote,
        updatePeerVolume,
        toggleMute,
        calculateVolumeFromSlider,
        calculateSliderFromVolume,
        DEFAULT_DB,
        setUseSampler,
        updatePeerSynthEffect, // Export new function for managing peer-specific effects
        createPeerSynth // Export for potential direct creation if needed by manager
    };
}