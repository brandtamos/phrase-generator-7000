require('dotenv').config();
const express = require('express');
const session = require('express-session');
const storage = require('node-persist');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'phrase-generator-secret';

// Utility to escape HTML and prevent script injection
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function unescapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#039;/g, "'");
}

// Initialize storage
async function initStorage() {
    await storage.init({
        dir: 'persist',
        stringify: JSON.stringify,
        parse: JSON.parse,
        encoding: 'utf8'
    });
    
    // Initialize lists if they don't exist
    if (!(await storage.getItem('list1'))) await storage.setItem('list1', []);
    if (!(await storage.getItem('list2'))) await storage.setItem('list2', []);
    if (!(await storage.getItem('settings'))) await storage.setItem('settings', { showPassword: '', listSubmitted: false });
    if (!(await storage.getItem('permanent_list1'))) await storage.setItem('permanent_list1', []);
    if (!(await storage.getItem('permanent_list2'))) await storage.setItem('permanent_list2', []);
}

initStorage();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Auth middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.authenticated) {
        return next();
    }
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/admin/login');
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/submit', async (req, res) => {
    const { word1, word2, showPassword } = req.body;
    
    // Validate show password
    const settings = await storage.getItem('settings') || { showPassword: '' };
    if (settings.showPassword && showPassword !== settings.showPassword) {
        if (req.headers['accept'] === 'application/json') {
            return res.status(401).json({ error: 'Invalid show password' });
        }
        return res.redirect('/?msg=Invalid show password');
    }

    if (word1) {
        const list1 = await storage.getItem('list1');
        const trimmed = escapeHtml(word1.trim());
        const newWord = { text: trimmed, selected: false };
        list1.push(newWord);
        await storage.setItem('list1', list1);
        io.emit('wordAdded', { list: 'list1', word: newWord });
    }
    
    if (word2) {
        const list2 = await storage.getItem('list2');
        const trimmed = escapeHtml(word2.trim());
        const newWord = { text: trimmed, selected: false };
        list2.push(newWord);
        await storage.setItem('list2', list2);
        io.emit('wordAdded', { list: 'list2', word: newWord });
    }
    
    if (req.headers['accept'] === 'application/json') {
        return res.json({ success: true, message: 'Words submitted successfully!' });
    }
    res.redirect('/?msg=Words submitted successfully!');
});

// Admin Routes
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        req.session.authenticated = true;
        if (req.headers['accept'] === 'application/json') {
            return res.json({ success: true });
        }
        res.redirect('/admin');
    } else {
        if (req.headers['accept'] === 'application/json') {
            return res.status(401).json({ error: 'Invalid password' });
        }
        res.redirect('/admin/login?error=Invalid password');
    }
});

app.get('/admin', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/permanentdb', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'permanent.html'));
});

app.get('/api/words', isAuthenticated, async (req, res) => {
    let list1 = await storage.getItem('list1') || [];
    let list2 = await storage.getItem('list2') || [];
    
    // Migration: Convert strings to objects if necessary
    const migrate = (list) => list.map(item => typeof item === 'string' ? { text: item, selected: false } : item);
    
    const migrated1 = migrate(list1);
    const migrated2 = migrate(list2);

    // Persist the migration if changes were made
    if (JSON.stringify(list1) !== JSON.stringify(migrated1)) {
        await storage.setItem('list1', migrated1);
    }
    if (JSON.stringify(list2) !== JSON.stringify(migrated2)) {
        await storage.setItem('list2', migrated2);
    }
    
    res.json({ list1: migrated1, list2: migrated2 });
});

app.get('/api/permanent', isAuthenticated, async (req, res) => {
    const list1 = await storage.getItem('permanent_list1') || [];
    const list2 = await storage.getItem('permanent_list2') || [];
    res.json({ list1, list2 });
});

app.get('/api/settings', isAuthenticated, async (req, res) => {
    const settings = await storage.getItem('settings') || { showPassword: '' };
    res.json(settings);
});

app.post('/api/settings', isAuthenticated, async (req, res) => {
    const { showPassword, listSubmitted } = req.body;
    const currentSettings = await storage.getItem('settings') || { showPassword: '', listSubmitted: false };
    
    // Admin can only uncheck (set to false), never check (set to true) manually.
    let newListSubmitted = currentSettings.listSubmitted;
    if (listSubmitted === false) {
        newListSubmitted = false;
    }

    const settings = { 
        showPassword: showPassword !== undefined ? showPassword : currentSettings.showPassword,
        listSubmitted: newListSubmitted
    };
    await storage.setItem('settings', settings);
    io.emit('settingsUpdated', settings);
    res.json({ success: true });
});

app.post('/api/words/toggle-select', isAuthenticated, async (req, res) => {
    let { list, index } = req.body;
    index = parseInt(index);
    
    const currentList = await storage.getItem(list);
    if (currentList && currentList[index] !== undefined) {
        // Handle migration on the fly if needed
        if (typeof currentList[index] === 'string') {
            currentList[index] = { text: currentList[index], selected: true };
        } else {
            currentList[index].selected = !currentList[index].selected;
        }
        await storage.setItem(list, currentList);
        io.emit('wordUpdated', { list, index, word: currentList[index] });
        return res.json({ success: true, selected: currentList[index].selected });
    }
    res.status(400).json({ error: 'Invalid list or index' });
});

app.post('/api/admin/add-word', isAuthenticated, async (req, res) => {
    const { list, word } = req.body;
    if (!list || !word) {
        return res.status(400).json({ error: 'List and word are required' });
    }

    const currentList = await storage.getItem(list);
    if (currentList) {
        const trimmed = escapeHtml(word.trim());
        const newWord = { text: trimmed, selected: false };
        currentList.push(newWord);
        await storage.setItem(list, currentList);
        io.emit('wordAdded', { list, word: newWord });
        return res.json({ success: true, word: newWord });
    }
    res.status(400).json({ error: 'Invalid list' });
});

app.post('/api/admin/clear-submissions', isAuthenticated, async (req, res) => {
    try {
        await storage.setItem('list1', []);
        await storage.setItem('list2', []);
        io.emit('listsCleared');
        res.json({ success: true });
    } catch (err) {
        console.error('Clear submissions failed:', err);
        res.status(500).json({ error: 'Failed to clear submissions' });
    }
});

app.post('/api/admin/publish', isAuthenticated, async (req, res) => {
    try {
        const list1 = await storage.getItem('list1') || [];
        const list2 = await storage.getItem('list2') || [];
        
        const selectedL1 = list1.filter(item => typeof item === 'object' && item.selected).map(item => item.text);
        const selectedL2 = list2.filter(item => typeof item === 'object' && item.selected).map(item => item.text);
        
        // Update livedb
        const livedbContent = [...selectedL1, ...selectedL2].join('\n');
        await storage.setItem('livedb', livedbContent);
        
        // Update permanent db (ignoring duplicates)
        let perm1 = await storage.getItem('permanent_list1') || [];
        let perm2 = await storage.getItem('permanent_list2') || [];
        
        perm1 = [...new Set([...perm1, ...selectedL1])];
        perm2 = [...new Set([...perm2, ...selectedL2])];
        
        await storage.setItem('permanent_list1', perm1);
        await storage.setItem('permanent_list2', perm2);

        // Mark list as submitted
        const settings = await storage.getItem('settings') || { showPassword: '', listSubmitted: false };
        settings.listSubmitted = true;
        await storage.setItem('settings', settings);
        io.emit('settingsUpdated', settings);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Publish failed:', err);
        res.status(500).json({ error: 'Failed to publish words' });
    }
});

app.get('/pg7k.js', async (req, res) => {
    const content = await storage.getItem('livedb') || '';
    res.setHeader('Content-Type', 'text/plain');
    res.send(unescapeHtml(content));
});

app.post('/admin/delete', isAuthenticated, async (req, res) => {
    const { list, index } = req.body;
    const currentList = await storage.getItem(list);
    if (currentList && currentList[index] !== undefined) {
        currentList.splice(index, 1);
        await storage.setItem(list, currentList);
        
        // Emit wordDeleted event
        io.emit('wordDeleted', { list, index: parseInt(index) });
    }
    
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: true });
    }
    res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
