const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function setupOctaveControls(keyboard, mainSynthInstance, room, MIN_OCTAVE, MAX_OCTAVE, keyboardMap) {
    let currentOctaveOffset = 0;
    let currentTransposition = 0;
    const activeSoundingNotes = new Set(); 
    let overrideKeyboardMap = { ...keyboardMap };
    let currentSynth = mainSynthInstance;

    function transposeKey(semitones) {
        const newTransposition = currentTransposition + semitones;
        if (newTransposition >= -12 && newTransposition <= 12) {
            releaseAllActiveNotes(); 
            currentTransposition = newTransposition;
            updateKeyLabels();
        }
    }

    function transposeNote(note, semitones) {
        const match = note.match(/([A-G]#?)(\d+)/);
        if (!match) return note; 

        const [, noteName, octaveNumStr] = match;
        const octave = parseInt(octaveNumStr);

        const noteIndex = NOTES.indexOf(noteName);
        if (noteIndex === -1) return note; 

        let newNoteIndex = noteIndex + semitones;
        let newOctave = octave;

        while (newNoteIndex >= 12) {
            newNoteIndex -= 12;
            newOctave++;
        }
        while (newNoteIndex < 0) {
            newNoteIndex += 12;
            newOctave--;
        }

        return `${NOTES[newNoteIndex]}${newOctave}`;
    }

    function shiftOctave(offset) {
        const newOffset = currentOctaveOffset + offset;
        if (newOffset >= MIN_OCTAVE && newOffset <= MAX_OCTAVE) { 
            releaseAllActiveNotes(); 
            currentOctaveOffset = newOffset;
            updateKeyLabels();
        }
    }

    function releaseAllActiveNotes() {
        const notesToRelease = Array.from(activeSoundingNotes);
        
        notesToRelease.forEach(soundingNote => { 
            currentSynth.triggerRelease(soundingNote);

            const keyElement = document.querySelector(`[data-note="${soundingNote}"]`); 
            if (keyElement) {
                keyElement.classList.remove('active');
            }
            
            room.send({
                type: 'noteOff',
                note: soundingNote,
                useSampler: currentSynth === window.sampler // Access the sampler using window if needed
            });
        });

        activeSoundingNotes.clear(); 
    }

    function updateKeyLabels() {
        const keyElements = keyboard.querySelectorAll('.white-key, .black-key');
        keyElements.forEach(keyElement => {
            if (!keyElement.dataset.originalNote) {
                 keyElement.dataset.originalNote = keyElement.dataset.note;
            }
            const originalNote = keyElement.dataset.originalNote;

            const [noteName, octaveNumStr] = originalNote.split(/(\d+)/);
            const baseOctave = parseInt(octaveNumStr);
            const newOctaveNum = baseOctave + currentOctaveOffset;
            let newNoteWithOctaveShift = `${noteName}${newOctaveNum}`;

            let finalDisplayedNote = transposeNote(newNoteWithOctaveShift, currentTransposition);

            keyElement.dataset.note = finalDisplayedNote; 

            let assignedKeyboardKey = null;
            for (const key in overrideKeyboardMap) {
                if (overrideKeyboardMap[key] === originalNote) { 
                    assignedKeyboardKey = key;
                    break;
                }
            }

            const keyLabel = keyElement.querySelector('.key-label');
            if (keyLabel) {
                if (assignedKeyboardKey) {
                   keyLabel.textContent = `${assignedKeyboardKey.toUpperCase()}\r\n${finalDisplayedNote}`;
                }
                else {
                    keyLabel.textContent = `\r\n${finalDisplayedNote}`;
                }
            }
        });
    }

    function setupKeyboardOctaveControls() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                shiftOctave(-1);
                e.preventDefault(); 
                return;
            } else if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                shiftOctave(1);
                e.preventDefault(); 
                return;
            } else if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                transposeKey(1);
                e.preventDefault(); 
                return;
            } else if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                transposeKey(-1);
                e.preventDefault(); 
                return;
            }
        });

        keyboard.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            const clickedKeyElement = e.target.closest('.white-key, .black-key');
            if (!clickedKeyElement) return;

            const originalPhysicalNote = clickedKeyElement.dataset.originalNote;
            if (!originalPhysicalNote) {
                console.warn("Cannot remap key: original note not found.");
                return;
            }

            const currentMapping = Object.keys(overrideKeyboardMap).find(
                key => overrideKeyboardMap[key] === originalPhysicalNote
            );

            const promptMessage = currentMapping ?
                `Change mapping for ${originalPhysicalNote} (currently '${currentMapping.toUpperCase()}')? Enter new key:` :
                `Map a key to ${originalPhysicalNote}. Enter key:`;

            const newKeyStr = prompt(promptMessage, currentMapping || '');

            if (newKeyStr === null) return; 

            if (newKeyStr === "") { 
                if (currentMapping) {
                    delete overrideKeyboardMap[currentMapping];
                    updateKeyLabels(); 
                }
                return;
            }

            if (newKeyStr && newKeyStr.length === 1) {
                const newKey = newKeyStr.toLowerCase();
                const existingNoteForKey = overrideKeyboardMap[newKey];
                if (existingNoteForKey && existingNoteForKey !== originalPhysicalNote) {
                    const replace = confirm(`Key '${newKey.toUpperCase()}' is already mapped to ${existingNoteForKey}. Replace mapping?`);
                    if (!replace) return;
                }

                if (currentMapping) {
                    delete overrideKeyboardMap[currentMapping];
                }
                if (overrideKeyboardMap[newKey] && overrideKeyboardMap[newKey] !== originalPhysicalNote) {
                    delete overrideKeyboardMap[newKey];
                }

                overrideKeyboardMap[newKey] = originalPhysicalNote;
                updateKeyLabels(); 
            } else if (newKeyStr.length > 1) {
                alert("Please enter a single character for the key mapping.");
            }
        });
    }

    function setupButtonOctaveControls() {
        const octaveDownBtn = document.getElementById('octave-down');
        const octaveUpBtn = document.getElementById('octave-up');

        if (octaveDownBtn) {
            octaveDownBtn.addEventListener('click', () => shiftOctave(-1));
        }

        if (octaveUpBtn) {
            octaveUpBtn.addEventListener('click', () => shiftOctave(1));
        }
    }

    function shiftKeyboardMapping(direction) {
        console.log("shiftKeyboardMapping called with direction:", direction);
    }

    setupKeyboardOctaveControls();
    setupButtonOctaveControls();
    updateKeyLabels(); 

    return {
        shiftOctave,
        getCurrentOctaveOffset: () => currentOctaveOffset,
        getCurrentTransposition: () => currentTransposition, 
        setCurrentOctaveOffset: (offset) => { 
            releaseAllActiveNotes();
            currentOctaveOffset = offset;
            updateKeyLabels();
        },
        transposeKey, 
        addActiveNote: (soundingNote) => activeSoundingNotes.add(soundingNote),
        removeActiveNote: (soundingNote) => activeSoundingNotes.delete(soundingNote),
        getActiveNotes: () => activeSoundingNotes, 
        shiftKeyboardMapping, 
        getOverrideKeyboardMap: () => overrideKeyboardMap, 
        transposeNote, 
        set mainSynth(newSynth) {
            currentSynth = newSynth;
        },
        get mainSynth() {
            return currentSynth;
        }
    };
}