export function setupManualHandler() {
    const infoButton = document.getElementById('info-button');
    const manualOverlay = document.getElementById('app-manual-overlay');
    const closeManualButton = document.getElementById('close-manual');

    function openManual() {
        manualOverlay.style.display = 'flex';
    }

    function closeManual() {
        manualOverlay.style.display = 'none';
    }

    infoButton.addEventListener('click', openManual);
    closeManualButton.addEventListener('click', closeManual);

    // Close manual when clicking outside the content
    manualOverlay.addEventListener('click', (e) => {
        if (e.target === manualOverlay) {
            closeManual();
        }
    });

    // Close manual with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && manualOverlay.style.display === 'flex') {
            closeManual();
        }
    });

    // The error occurs because we're looking for a section that doesn't exist or has changed
    // Let's check if the section exists before trying to modify it
    const manualContent = document.querySelector('.manual-content');
    const keyboardMappingSection = manualContent?.querySelector('section:nth-child(2)');
    
    if (keyboardMappingSection) {
        // Add sustain information to the keyboard mapping section
        const keyboardMappingList = keyboardMappingSection.querySelector('ul');
        if (keyboardMappingList) {
            // Check if sustain info is already there to avoid duplicates or update existing
            let sustainListItem = Array.from(keyboardMappingList.querySelectorAll('li'))
                .find(li => li.textContent.includes('sustain'));
            
            if (!sustainListItem) {
                sustainListItem = document.createElement('li');
                keyboardMappingList.appendChild(sustainListItem);
            }
            // Update or set the text content to mention the Space key
            sustainListItem.textContent = 'Hold Space key for sustain (notes continue playing after release)';
        }
    }
}

// Call the setup function when the module is loaded
setupManualHandler();