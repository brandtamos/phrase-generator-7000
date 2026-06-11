const socket = io();

// Initial load of words
async function loadWords() {
    try {
        const response = await fetch('/api/words', {
            headers: {
                'x-requested-with': 'XMLHttpRequest'
            }
        });
        
        if (response.status === 401) {
            window.location.href = '/admin/login';
            return;
        }

        const data = await response.json();
        renderList('list1', data.list1);
        renderList('list2', data.list2);
        
        // Also load settings to set button state
        loadSettings();
    } catch (err) {
        console.error('Failed to load words:', err);
    }
}

async function loadSettings() {
    try {
        const response = await fetch('/api/settings', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (response.ok) {
            const settings = await response.json();
            updateSubmitButton(settings.listSubmitted);
        }
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

function updateSubmitButton(isSubmitted) {
    const btn = document.querySelector('.btn-primary[onclick="publishWords()"]');
    if (!btn) return;

    if (isSubmitted) {
        btn.disabled = true;
        btn.innerHTML = '🔒 Submit';
    } else {
        btn.disabled = false;
        btn.innerHTML = 'Submit';
    }
}

function updateCounts() {
    ['list1', 'list2'].forEach(listId => {
        const listEl = document.getElementById(listId);
        if (listEl) {
            const selectedCount = listEl.querySelectorAll('.word-item.selected').length;
            document.getElementById(`count-${listId}`).textContent = selectedCount;
        }
    });
}

function renderList(listId, words) {
    const listEl = document.getElementById(listId);
    listEl.innerHTML = '';
    words.forEach((wordObj, index) => {
        addWordToList(listId, wordObj, index);
    });
    updateCounts();
}

function addWordToList(listId, wordObj, index) {
    // Handle both old string format and new object format
    const text = typeof wordObj === 'string' ? wordObj : (wordObj.text || '');
    const isSelected = typeof wordObj === 'string' ? false : !!wordObj.selected;

    const listEl = document.getElementById(listId);
    const li = document.createElement('li');
    li.className = `word-item ${isSelected ? 'selected' : ''}`;
    li.dataset.index = index;
    li.setAttribute('onclick', `toggleSelect(this, '${listId}', ${index})`);
    li.innerHTML = `
        <span>${escapeHtml(text)}</span>
        <button type="button" class="btn-delete" onclick="event.stopPropagation(); deleteWord('${listId}', ${index})">&times;</button>
    `;
    listEl.appendChild(li);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle word addition (from Socket.IO)
socket.on('wordAdded', (data) => {
    const listEl = document.getElementById(data.list);
    const index = listEl.children.length;
    addWordToList(data.list, data.word, index);
    updateCounts();
});

// Handle word update (from Socket.IO)
socket.on('wordUpdated', (data) => {
    const listEl = document.getElementById(data.list);
    const items = listEl.querySelectorAll('.word-item');
    items.forEach(item => {
        if (parseInt(item.dataset.index) === parseInt(data.index)) {
            if (data.word.selected) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        }
    });
    updateCounts();
});

// Handle word deletion (from Socket.IO)
socket.on('wordDeleted', (data) => {
    removeElementFromList(data.list, data.index);
});

// Handle clearing all lists
socket.on('listsCleared', () => {
    document.getElementById('list1').innerHTML = '';
    document.getElementById('list2').innerHTML = '';
    updateCounts();
});

// Handle real-time settings updates
socket.on('settingsUpdated', (settings) => {
    updateSubmitButton(settings.listSubmitted);
    // Update checkbox in modal if it's open
    const checkbox = document.getElementById('setting-list-submitted');
    if (checkbox) {
        checkbox.checked = !!settings.listSubmitted;
        checkbox.disabled = !settings.listSubmitted;
    }
});

async function toggleSelect(element, list, index) {
    // Optimistic UI update
    element.classList.toggle('selected');
    updateCounts();
    
    try {
        const response = await fetch('/api/words/toggle-select', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ list, index })
        });
        
        if (response.status === 401) {
            window.location.href = '/admin/login';
        } else if (!response.ok) {
            // Revert on error
            element.classList.toggle('selected');
            updateCounts();
        }
    } catch (err) {
        console.error('Toggle failed:', err);
        element.classList.toggle('selected');
        updateCounts();
    }
}

async function deleteWord(list, index) {
    const listEl = document.getElementById(list);
    const items = listEl.querySelectorAll('.word-item');
    let targetItem = null;
    items.forEach(item => {
        if (parseInt(item.dataset.index) === index) {
            targetItem = item;
        }
    });

    const wordText = targetItem ? targetItem.querySelector('span').textContent : 'this word';

    if (!confirm(`Are you sure you want to delete "${wordText}"?`)) {
        return;
    }
    try {
        const response = await fetch('/admin/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ list, index })
        });
        
        if (response.status === 401) {
            window.location.href = '/admin/login';
        }
    } catch (err) {
        console.error('Delete failed:', err);
    }
}

function removeElementFromList(listId, index) {
    const listEl = document.getElementById(listId);
    const items = listEl.querySelectorAll('.word-item');
    
    let targetItem = null;
    items.forEach(item => {
        if (parseInt(item.dataset.index) === index) {
            targetItem = item;
        }
    });

    if (targetItem) {
        targetItem.classList.add('removing');
        setTimeout(() => {
            targetItem.remove();
            syncIndices(listId);
            updateCounts();
        }, 300);
    }
}

function syncIndices(listId) {
    const listEl = document.getElementById(listId);
    const items = listEl.querySelectorAll('.word-item');
    items.forEach((item, newIndex) => {
        item.dataset.index = newIndex;
        // Update the onclick handlers with the new index
        item.setAttribute('onclick', `toggleSelect(this, '${listId}', ${newIndex})`);
        const btn = item.querySelector('.btn-delete');
        btn.setAttribute('onclick', `event.stopPropagation(); deleteWord('${listId}', ${newIndex})`);
        btn.innerHTML = '&times;';
    });
}

async function addAdminWord(listId) {
    const input = document.getElementById(`admin-input-${listId}`);
    const word = input.value.trim();
    
    if (!word) return;

    try {
        const response = await fetch('/api/admin/add-word', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ list: listId, word })
        });

        if (response.ok) {
            input.value = '';
            // Note: UI update is handled by the socket.on('wordAdded') listener
        } else {
            const err = await response.json();
            alert(`Failed to add word: ${err.error}`);
        }
    } catch (err) {
        console.error('Error adding admin word:', err);
    }
}

function handleKeyPress(event, listId) {
    if (event.key === 'Enter') {
        addAdminWord(listId);
    }
}

async function pullRandomWord(listId) {
    try {
        const response = await fetch('/api/permanent', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        
        if (response.ok) {
            const data = await response.json();
            const permList = listId === 'list1' ? data.list1 : data.list2;
            
            if (permList && permList.length > 0) {
                const randomIndex = Math.floor(Math.random() * permList.length);
                const randomWord = permList[randomIndex];
                document.getElementById(`admin-input-${listId}`).value = randomWord;
            } else {
                alert('The permanent database for this list is empty.');
            }
        } else if (response.status === 401) {
            window.location.href = '/admin/login';
        }
    } catch (err) {
        console.error('Failed to pull random word:', err);
        alert('Could not connect to the permanent database.');
    }
}

async function clearSubmissions() {
    if (!confirm('Are you sure you want to clear ALL current submissions? This will not affect the live or permanent databases.')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/clear-submissions', {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (response.ok) {
            // Local update is handled by socket 'listsCleared' event
            const statusEl = document.getElementById('settings-status');
            statusEl.textContent = 'Current lists cleared!';
            statusEl.style.color = '#2ecc71';
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        } else {
            alert('Failed to clear submissions.');
        }
    } catch (err) {
        console.error('Clear error:', err);
    }
}

async function publishWords() {
    const statusEl = document.getElementById('publish-status');
    statusEl.textContent = 'Publishing...';
    statusEl.style.color = '#333';

    try {
        const response = await fetch('/api/admin/publish', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (response.ok) {
            statusEl.textContent = 'Successfully submitted!';
            statusEl.style.color = '#2ecc71';
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        } else {
            const err = await response.json();
            statusEl.textContent = `Publish failed: ${err.error || 'Unknown error'}`;
            statusEl.style.color = '#e74c3c';
        }
    } catch (err) {
        console.error('Publish error:', err);
        statusEl.textContent = 'Publish failed. Check console.';
        statusEl.style.color = '#e74c3c';
    }
}

async function openSettings() {
    const modal = document.getElementById('settings-modal');
    modal.style.display = 'block';
    
    try {
        const response = await fetch('/api/settings', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (response.ok) {
            const settings = await response.json();
            document.getElementById('setting-show-password').value = settings.showPassword || '';
            
            const checkbox = document.getElementById('setting-list-submitted');
            checkbox.checked = !!settings.listSubmitted;
            // Admin can only uncheck, not check. So if it's already unchecked, disable it.
            checkbox.disabled = !settings.listSubmitted;
        }
    } catch (err) {
        console.error('Failed to fetch settings:', err);
    }
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
    document.getElementById('settings-status').textContent = '';
}

async function saveSettings() {
    const showPassword = document.getElementById('setting-show-password').value;
    const listSubmitted = document.getElementById('setting-list-submitted').checked;
    const statusEl = document.getElementById('settings-status');
    statusEl.textContent = 'Saving...';
    statusEl.style.color = '#333';

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ showPassword, listSubmitted })
        });

        if (response.ok) {
            statusEl.textContent = 'Settings saved!';
            statusEl.style.color = '#2ecc71';
            setTimeout(closeSettings, 1500);
        } else {
            statusEl.textContent = 'Failed to save settings.';
            statusEl.style.color = '#e74c3c';
        }
    } catch (err) {
        console.error('Save settings error:', err);
        statusEl.textContent = 'Error saving settings.';
        statusEl.style.color = '#e74c3c';
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('settings-modal');
    if (event.target == modal) {
        closeSettings();
    }
}

// Initialize
loadWords();
