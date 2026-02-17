// Create a function to initialize and connect all effects
export function createEffectsChain(source1, source2, volumeNode, masterOutput) {
    // Create effects for the local player
    const distortion = new Tone.Distortion(0.8);
    const reverb = new Tone.Reverb(3);
    const pingPongDelay = new Tone.PingPongDelay("8n", 0.5);

    // Initialize reverb
    reverb.generate().then(() => {
        console.log("Reverb generated successfully");
    });

    // Set initial wet values for all effects to 0 (dry signal only)
    distortion.wet.value = 0;
    reverb.wet.value = 0;
    pingPongDelay.wet.value = 0;

    // Connect the local player's effects chain
    source1.connect(volumeNode); // Local sampler
    source2.connect(volumeNode); // Local synth
  
    volumeNode.connect(distortion);
    distortion.connect(reverb);
    reverb.connect(pingPongDelay);
    pingPongDelay.connect(masterOutput);
    masterOutput.toDestination();

    return { distortion, reverb, pingPongDelay };
}

export function setupEffectsSynchronization(room, distortion, reverb, pingPongDelay, distortionSlider, reverbSlider, delaySlider) {
    function broadcastEffectUpdate(type, value) {
        room.send({
            type: `${type}Update`,
            value: value,
            echo: true // Echo true means local client will also receive this if subscribed,
                       // but typically onmessage handlers ignore self-sent messages.
        });
        
        // Update local player's presence with their effect values
        room.updatePresence({
            [`${type}Value`]: value
        });
        
        console.log(`[EFFECTS-TRACE] Broadcasting local player ${type} effect update, value=${value}`);
    }

    function setupEffectSliderListener(slider, effect, effectName) {
        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            // Set the wet value for the local player's effect
            effect.wet.value = value;
            console.log(`[EFFECTS-TRACE] Local player's ${effectName} changed to ${value}.`);
            broadcastEffectUpdate(effectName, value);
        });
    }

    // Set up listeners for each local effect slider
    setupEffectSliderListener(distortionSlider, distortion, 'distortion');
    setupEffectSliderListener(reverbSlider, reverb, 'reverb');
    setupEffectSliderListener(delaySlider, pingPongDelay, 'delay');

    // Sync UI sliders with current local effect values (e.g. on load)
    distortionSlider.value = distortion.wet.value;
    reverbSlider.value = reverb.wet.value;
    delaySlider.value = pingPongDelay.wet.value;

    // Initialize presence with local player's effect values
    room.updatePresence({
        distortionValue: distortion.wet.value,
        reverbValue: reverb.wet.value,
        delayValue: pingPongDelay.wet.value
    });

    // Subscribe to local player's own presence to set initial values if they were stored/changed elsewhere
    // This might be redundant if sliders are source of truth, but good for consistency.
    const unsub = room.subscribePresence((presence) => {
        const clientPresence = presence[room.clientId] || {};
        // This part mainly ensures that if presence was set by another tab or restored, local UI reflects it.
        // However, typically, local UI drives presence for effects.
        if (clientPresence.distortionValue !== undefined && distortion.wet.value !== clientPresence.distortionValue) {
            // This could cause a loop if not careful, but slider input should be main driver.
            // For now, we assume sliders init effects, then presence.
        }
        // Similar checks for reverb and delay if needed.
    });
    // Consider if unsub() is needed or if this subscription is lifetime.

    // This module no longer returns functions to manage peer effects.
    // Those are handled by peer-audio.js.
    return {
        // No methods returned, or an empty object, as its primary role is to set up local effects
        // and their synchronization.
    };
}