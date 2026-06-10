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
    words.forEach(word => {
        const li = document.createElement('li');
        li.className = 'word-item';
        li.innerHTML = `<span>${escapeHtml(word)}</span>`;
        listEl.appendChild(li);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
loadPermanentWords();
