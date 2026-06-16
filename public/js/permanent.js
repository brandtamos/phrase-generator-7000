const socket = io();

async function loadPermanentWords() {
    try {
        const response = await fetch('/api/permanent', {
            headers: {
                'x-requested-with': 'XMLHttpRequest'
            }
        });
        
        if (response.status === 401) {
            window.location.href = '/admin/login';
            return;
        }

        const data = await response.json();
        renderPermList('perm-list1', data.list1);
        renderPermList('perm-list2', data.list2);
    } catch (err) {
        console.error('Failed to load permanent words:', err);
    }
}

function renderPermList(listId, words) {
    const listEl = document.getElementById(listId);
    listEl.innerHTML = '';
    const storageKey = listId === 'perm-list1' ? 'permanent_list1' : 'permanent_list2';
    
    words.forEach((word, index) => {
        const li = document.createElement('li');
        li.className = 'word-item';
        li.dataset.index = index;
        li.innerHTML = `
            <span>${escapeHtml(word)}</span>
            <button type="button" class="btn-delete" onclick="deletePermWord('${storageKey}', ${index})">&times;</button>
        `;
        listEl.appendChild(li);
    });
}

async function deletePermWord(list, index) {
    const listId = list === 'permanent_list1' ? 'perm-list1' : 'perm-list2';
    const listEl = document.getElementById(listId);
    const items = listEl.querySelectorAll('.word-item');
    let targetItem = null;
    items.forEach(item => {
        if (parseInt(item.dataset.index) === index) {
            targetItem = item;
        }
    });

    const wordText = targetItem ? targetItem.querySelector('span').textContent : 'this word';

    if (!confirm(`Are you sure you want to delete "${wordText}" from the permanent database?`)) {
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

function removeElementFromList(listName, index) {
    const listId = listName === 'permanent_list1' ? 'perm-list1' : 'perm-list2';
    const listEl = document.getElementById(listId);
    if (!listEl) return;

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
        }, 300);
    }
}

function syncIndices(listId) {
    const listEl = document.getElementById(listId);
    const items = listEl.querySelectorAll('.word-item');
    const storageKey = listId === 'perm-list1' ? 'permanent_list1' : 'permanent_list2';

    items.forEach((item, newIndex) => {
        item.dataset.index = newIndex;
        const btn = item.querySelector('.btn-delete');
        if (btn) {
            btn.setAttribute('onclick', `deletePermWord('${storageKey}', ${newIndex})`);
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle word deletion (from Socket.IO)
socket.on('wordDeleted', (data) => {
    if (data.list === 'permanent_list1' || data.list === 'permanent_list2') {
        removeElementFromList(data.list, data.index);
    }
});

// Initialize
loadPermanentWords();
