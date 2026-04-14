const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = 3002;
const SERVER_VERSION = Date.now().toString(); // Changes on every restart

// Version check — clients poll this to detect restarts
app.get('/api/version', (req, res) => {
    res.json({ version: SERVER_VERSION });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'crm-secret-key-2024-super',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const filesDir = path.join(__dirname, 'files');
if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir);
const upload = multer({ dest: uploadsDir });
const avatarsDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
const avatarUpload = multer({ dest: avatarsDir, limits: { fileSize: 5 * 1024 * 1024 } });

// === DATA REPAIR: fix assigned_workers stored as raw arrays instead of JSON strings ===
(function repairAssignedWorkers() {
    let fixed = 0;
    const deptBases = db.findAll('dept_bases');
    deptBases.forEach(b => {
        if (b.assigned_workers && Array.isArray(b.assigned_workers)) {
            db.update('dept_bases', x => x.id === b.id, { assigned_workers: JSON.stringify(b.assigned_workers) });
            fixed++;
        }
    });
    if (fixed > 0) console.log(`[DB REPAIR] Fixed ${fixed} dept_bases with raw array assigned_workers`);
})();

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    next();
}
function requireAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    next();
}

// Avatar upload - saves to public/avatars with user-specific name
app.post('/api/user/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const ext = path.extname(req.file.originalname) || '.png';
    const newName = `user_${req.session.userId}${ext}`;
    const newPath = path.join(avatarsDir, newName);
    // Remove old avatar
    try {
        const files = fs.readdirSync(avatarsDir);
        files.filter(f => f.startsWith(`user_${req.session.userId}`)).forEach(f => {
            try { fs.unlinkSync(path.join(avatarsDir, f)); } catch(e) {}
        });
    } catch(e) {}
    fs.renameSync(req.file.path, newPath);
    const avatarUrl = '/avatars/' + newName + '?t=' + Date.now();
    db.update('users', u => u.id === req.session.userId, { avatar: avatarUrl });
    res.json({ ok: true, avatar: avatarUrl });
});

// Get avatar
app.get('/api/user/avatar', requireAuth, (req, res) => {
    const user = db.findOne('users', u => u.id === req.session.userId);
    res.json({ avatar: (user && user.avatar) || null });
});

// Extended nickname configuration
app.post('/api/user/nick-config', requireAuth, (req, res) => {
    const { font, badge, animation, glow, outline } = req.body;
    db.update('users', u => u.id === req.session.userId, {
        nick_font: font || '',
        nick_badge: badge || '',
        nick_animation: animation || '',
        nick_glow: glow || '',
        nick_outline: outline || ''
    });
    res.json({ ok: true });
});


function requireDeptAuth(req, res, next) {
    if (!req.session.userId || !req.session.isDeptUser) return res.status(401).json({ error: 'Не авторизован (отдел)' });
    next();
}

// ============ AUTH ============
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.findOne('users', u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.displayName = user.display_name;
    res.json({ id: user.id, username: user.username, display_name: user.display_name, role: user.role, coins: user.coins || 0, owned_mascots: user.owned_mascots || [] });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
    const user = db.findOne('users', u => u.id === req.session.userId);
    if (!user) return res.status(401).json({ error: 'Не авторизован' });
    res.json({ id: user.id, username: user.username, display_name: user.display_name, role: user.role, avatar: user.avatar || null, nick_style: user.nick_style || 'neon' });
});

// Avatar upload
app.post('/api/user/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Нет файла' });
    const ext = path.extname(req.file.originalname) || '.jpg';
    const newName = `avatar_${req.session.userId}${ext}`;
    const newPath = path.join(avatarsDir, newName);
    try { if (fs.existsSync(newPath)) fs.unlinkSync(newPath); } catch(e) {}
    fs.renameSync(req.file.path, newPath);
    db.update('users', u => u.id === req.session.userId, { avatar: 'avatars/' + newName });
    res.json({ avatar: 'avatars/' + newName });
});

// Nick style
app.post('/api/user/nick-style', requireAuth, (req, res) => {
    const { style } = req.body;
    if (!['neon', 'dark', 'gold', 'fire'].includes(style)) return res.status(400).json({ error: 'Invalid style' });
    db.update('users', u => u.id === req.session.userId, { nick_style: style });
    res.json({ ok: true });
});

// User stats for profile (rank + medals)
app.get('/api/my-stats', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const actions = db.findAll('lead_actions', a => a.user_id === userId);
    const total = actions.length;
    const passed = actions.filter(a => a.action_type === 'passed' || a.action_type === 'передал').length;
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = actions.filter(a => (a.created_at || '').startsWith(today)).length;

    // Calculate streak (consecutive days)
    const daySet = new Set();
    actions.forEach(a => { if (a.created_at) daySet.add(a.created_at.slice(0, 10)); });
    const days = [...daySet].sort().reverse();
    let streak = 0;
    let checkDate = new Date();
    for (let i = 0; i < days.length && i < 60; i++) {
        const dateStr = checkDate.toISOString().slice(0, 10);
        if (days.includes(dateStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }

    res.json({ total, passed, today: todayCount, streak });
});

// Missed calls phone count analytics
app.get('/api/analytics/missed-calls', requireAuth, (req, res) => {
    // Find all leads with last action = не_дозвон
    const allLeads = db.findAll('leads');
    const allActions = db.findAll('lead_actions');

    // Get last action per lead
    const lastActionMap = {};
    allActions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    allActions.forEach(a => { lastActionMap[a.lead_id] = a.action_type; });

    const missedLeads = allLeads.filter(l => {
        const lastAction = lastActionMap[l.id];
        return lastAction && (lastAction === 'не_дозвон' || lastAction === 'not_reached');
    });

    // Count phones per lead
    function countPhones(lead) {
        let count = 0;
        // Count main phones field
        if (lead.phones) {
            const phoneStr = String(lead.phones);
            const phones = phoneStr.split(/[,;\n\r]+/).map(p => p.trim()).filter(p => p.length >= 5);
            count += phones.length;
        }
        // Count phones in relatives
        try {
            const rels = JSON.parse(lead.relatives || '[]');
            if (Array.isArray(rels)) {
                rels.forEach(r => {
                    if (r.phone && String(r.phone).trim().length >= 5) count++;
                });
            }
        } catch(e) {}
        return Math.max(count, 0);
    }

    // Group by region
    const regionMap = {};
    missedLeads.forEach(l => {
        const region = l.region || 'Без региона';
        if (!regionMap[region]) regionMap[region] = { region, cards: 0, phones: 0, details: [] };
        const phoneCount = countPhones(l);
        regionMap[region].cards++;
        regionMap[region].phones += phoneCount;
        regionMap[region].details.push({
            id: l.id,
            name: l.deceased_name || '—',
            phones: phoneCount
        });
    });

    const regions = Object.values(regionMap).sort((a, b) => b.phones - a.phones);
    const totalCards = missedLeads.length;
    const totalPhones = regions.reduce((s, r) => s + r.phones, 0);

    res.json({ regions, totalCards, totalPhones });
});

// Phone number lookup proxy (voxlink.ru)
app.get('/api/phone-lookup', requireAuth, async (req, res) => {
    const num = (req.query.num || '').replace(/[^\d+]/g, '');
    if (!num || num.length < 10) return res.status(400).json({ error: 'Invalid number' });
    try {
        const http = require('http');
        const url = `http://num.voxlink.ru/get/?num=${encodeURIComponent(num)}`;
        const data = await new Promise((resolve, reject) => {
            http.get(url, { timeout: 5000 }, (resp) => {
                let body = '';
                resp.on('data', chunk => body += chunk);
                resp.on('end', () => {
                    try { resolve(JSON.parse(body)); } catch(e) { reject(new Error('Parse error')); }
                });
            }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
        });
        res.json(data);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Determine dominant region per base from lead addresses/regions
app.get('/api/admin/base-timezones', requireAuth, (req, res) => {
    const bases = db.findAll('bases');
    const leads = db.findAll('leads');
    const result = {};

    bases.forEach(base => {
        const baseLeads = leads.filter(l => l.base_id === base.id);
        const regionCounts = {};

        baseLeads.forEach(l => {
            // Check lead.region field
            if (l.region && l.region.trim()) {
                const r = l.region.trim();
                regionCounts[r] = (regionCounts[r] || 0) + 1;
            }
            // Also parse addresses for region hints
            const addr = l.address || '';
            if (addr) {
                const parts = addr.toLowerCase();
                // Extract "область", "край", "республика" patterns
                const matches = parts.match(/([\wа-яёА-ЯЁ]+\s+(?:область|обл\.|край|республика))/gi);
                if (matches) {
                    matches.forEach(m => {
                        const key = m.trim();
                        regionCounts[key] = (regionCounts[key] || 0) + 1;
                    });
                }
            }
        });

        // Find most common region
        let dominant = base.name; // fallback to base name
        let maxCount = 0;
        Object.entries(regionCounts).forEach(([region, count]) => {
            if (count > maxCount) {
                maxCount = count;
                dominant = region;
            }
        });

        result[base.id] = { dominant, count: maxCount, total: baseLeads.length };
    });

    res.json(result);
});

// ============ AUTO-DIAL LIQUIDITY SYSTEM ============

// Postback receiver from external calling service (no auth - external service calls this)
app.get('/api/postback', (req, res) => {
    const phone = (req.query.phone || '').replace(/[^\d+]/g, '');
    const status = req.query.status || '';
    const completed = req.query.completed || new Date().toISOString();
    const duration = req.query.duration || '0';
    const record_url = req.query.record || '';
    const call_id = req.query.call_id || '';

    if (!phone) return res.send('OK');

    // Normalize phone for matching (last 10 digits)
    const phoneLast10 = phone.replace(/\D/g, '').slice(-10);

    // Find matching entry in autodial_queue
    const entry = db.findOne('autodial_queue', q =>
        q.phone.replace(/\D/g, '').slice(-10) === phoneLast10 && q.is_liquid === null
    );

    if (entry) {
        const answered = status.toLowerCase().includes('answer') ||
                         status.toLowerCase().includes('success') ||
                         status === 'ANSWER' ||
                         parseInt(duration) > 3;

        const newCycle = entry.cycle_count + 1;
        const isMaxCycles = newCycle >= 10;

        db.update('autodial_queue', q => q.id === entry.id, {
            last_status: answered ? 'answered' : 'no_answer',
            last_dial_at: completed,
            cycle_count: newCycle,
            duration: parseInt(duration) || 0,
            record_url: record_url,
            call_id: call_id,
            raw_status: status,
            is_liquid: answered ? true : (isMaxCycles ? false : null),
            updated_at: new Date().toISOString()
        });
    }

    res.send('OK');
});

// Get autodial bases (grouped by region)
app.get('/api/admin/autodial-bases', requireAuth, (req, res) => {
    const queue = db.findAll('autodial_queue');
    const regionMap = {};

    queue.forEach(q => {
        const region = q.region || 'Без региона';
        if (!regionMap[region]) regionMap[region] = { region, total: 0, pending: 0, answered: 0, no_answer: 0, non_liquid: 0, phones: [] };
        regionMap[region].total++;
        if (q.is_liquid === true) regionMap[region].answered++;
        else if (q.is_liquid === false) regionMap[region].non_liquid++;
        else if (q.last_status === 'no_answer') regionMap[region].no_answer++;
        else regionMap[region].pending++;
    });

    const regions = Object.values(regionMap).sort((a, b) => b.total - a.total);
    const totalAll = queue.length;
    const totalLiquid = queue.filter(q => q.is_liquid === true).length;
    const totalNonLiquid = queue.filter(q => q.is_liquid === false).length;
    const totalPending = queue.filter(q => q.is_liquid === null).length;

    res.json({ regions, totalAll, totalLiquid, totalNonLiquid, totalPending });
});

// Collect missed calls into autodial queue
app.post('/api/admin/autodial-collect', requireAuth, (req, res) => {
    const allLeads = db.findAll('leads');
    const allActions = db.findAll('lead_actions');
    const queue = db.findAll('autodial_queue');

    // Get leads with last action = не_дозвон
    const lastActionMap = {};
    allActions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    allActions.forEach(a => { lastActionMap[a.lead_id] = a.action_type; });

    const missedLeads = allLeads.filter(l => {
        const lastAction = lastActionMap[l.id];
        return lastAction && (lastAction === 'не_дозвон' || lastAction === 'not_reached');
    });

    let added = 0;
    missedLeads.forEach(lead => {
        // Collect all phones from lead
        const phones = [];
        if (lead.phones) {
            String(lead.phones).split(/[,;\n\r]+/).map(p => p.trim()).filter(p => p.length >= 5).forEach(p => phones.push(p));
        }
        try {
            const rels = JSON.parse(lead.relatives || '[]');
            if (Array.isArray(rels)) rels.forEach(r => { if (r.phone && String(r.phone).trim().length >= 5) phones.push(String(r.phone).trim()); });
        } catch(e) {}

        const baseName = lead.region || 'Без региона';
        const base = lead.base_id ? db.findOne('bases', b => b.id === lead.base_id) : null;

        phones.forEach(phone => {
            const phoneLast10 = phone.replace(/\D/g, '').slice(-10);
            // Check if already in queue
            const existing = queue.find(q => q.phone.replace(/\D/g, '').slice(-10) === phoneLast10 && q.lead_id === lead.id);
            if (!existing) {
                db.insert('autodial_queue', {
                    lead_id: lead.id,
                    phone: phone,
                    deceased_name: lead.deceased_name || '',
                    region: lead.region || '',
                    base_name: base ? base.name : baseName,
                    cycle_count: 0,
                    last_status: 'pending',
                    last_dial_at: null,
                    is_liquid: null, // null=pending, true=liquid, false=non-liquid
                    duration: 0,
                    record_url: '',
                    created_at: new Date().toISOString()
                });
                added++;
            }
        });
    });

    res.json({ ok: true, added, total: db.findAll('autodial_queue').length });
});

// Export phones for a region (to upload to calling service)
app.get('/api/admin/autodial-export/:region', requireAuth, (req, res) => {
    const region = decodeURIComponent(req.params.region);
    const queue = db.findAll('autodial_queue', q =>
        q.region === region && q.is_liquid === null && q.cycle_count < 10
    );
    // Only phones that haven't been answered yet
    const phones = queue.map(q => ({
        phone: q.phone,
        name: q.deceased_name,
        cycle: q.cycle_count,
        param1: q.lead_id
    }));
    res.json({ region, count: phones.length, phones });
});

// Return liquid (answered) leads back to worker pool
app.post('/api/admin/autodial-return-liquid', requireAuth, (req, res) => {
    const { region } = req.body;
    const liquidEntries = db.findAll('autodial_queue', q =>
        q.is_liquid === true && (!region || q.region === region)
    );

    let returned = 0;
    liquidEntries.forEach(entry => {
        // Reset lead status to 'new' so workers can call them again
        const lead = db.findOne('leads', l => l.id === entry.lead_id);
        if (lead) {
            // Add action to mark as returned
            db.insert('lead_actions', {
                lead_id: entry.lead_id,
                action_type: 'new',
                user_id: req.session.userId,
                comment: 'Возвращён из автопрозвона (ликвидный)',
                created_at: new Date().toISOString()
            });
            returned++;
        }
        // Mark entry as returned
        db.update('autodial_queue', q => q.id === entry.id, { is_liquid: 'returned', returned_at: new Date().toISOString() });
    });

    res.json({ ok: true, returned });
});

// Get autodial history for a region
app.get('/api/admin/autodial-detail/:region', requireAuth, (req, res) => {
    const region = decodeURIComponent(req.params.region);
    const entries = db.findAll('autodial_queue', q => q.region === region);
    res.json(entries.sort((a, b) => (b.cycle_count || 0) - (a.cycle_count || 0)));
});

// ============ LEADS ============

app.post('/api/leads', requireAuth, (req, res) => {
    const { deceased_name, relatives, phones, address, extra_info, region } = req.body;
    // relatives is an array: [{name, relationship}]

    const existing = db.findOne('leads', l => l.deceased_name && l.deceased_name.toLowerCase().trim() === deceased_name.trim().toLowerCase());
    if (existing) {
        return res.status(409).json({ error: 'Лид с таким ФИО умершего уже существует!' });
    }

    const result = db.insert('leads', {
        deceased_name: deceased_name.trim(),
        relatives: JSON.stringify(relatives || []),
        phones: phones || '',
        address: address || '',
        extra_info: extra_info || '',
        region: region || '',
        created_by: req.session.userId,
        status: 'new',
        assigned_to: null,
        source: 'manual',
        base_id: null,
        created_at: new Date().toISOString()
    });

    res.json({ id: result.lastInsertRowid });
});

// Recent lead creation activity (live feed)
app.get('/api/leads/recent-activity', requireAuth, (req, res) => {
    const leads = db.findAll('leads')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20);
    const activity = leads.map(l => {
        const creator = db.findOne('users', u => u.id === l.created_by);
        return {
            creator: creator ? creator.display_name : 'Система',
            region: l.region || '',
            deceased: l.deceased_name,
            time: l.created_at
        };
    });
    // Also group by creator: count today
    const today = new Date().toISOString().slice(0, 10);
    const todayLeads = db.findAll('leads').filter(l => l.created_at && l.created_at.startsWith(today));
    const byUser = {};
    todayLeads.forEach(l => {
        const creator = db.findOne('users', u => u.id === l.created_by);
        const name = creator ? creator.display_name : 'Система';
        if (!byUser[name]) byUser[name] = { count: 0, regions: {} };
        byUser[name].count++;
        if (l.region) byUser[name].regions[l.region] = (byUser[name].regions[l.region] || 0) + 1;
    });
    const todayStats = Object.entries(byUser)
        .map(([name, data]) => ({ name, count: data.count, regions: data.regions }))
        .sort((a, b) => b.count - a.count);
    res.json({ activity, todayStats, totalToday: todayLeads.length });
});

// Get single lead by ID (for callbacks)
app.get('/api/leads/:id/full', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const lead = db.findOne('leads', l => l.id === id);
    if (!lead) return res.status(404).json({ error: 'Лид не найден' });
    const creator = db.findOne('users', u => u.id === lead.created_by);
    lead.creator_name = creator ? creator.display_name : 'Система';
    try { lead.relatives_parsed = JSON.parse(lead.relatives || '[]'); } catch (e) { lead.relatives_parsed = []; }
    // Include lead_actions with comments
    const leadActions = db.findAll('lead_actions', a => a.lead_id === id);
    lead.actions = leadActions.map(a => {
        const actionUser = db.findOne('users', u => u.id === a.user_id);
        return {
            action_type: a.action_type,
            comment: a.comment || '',
            user_name: actionUser ? actionUser.display_name : '',
            created_at: a.created_at
        };
    });
    // Add return stats
    Object.assign(lead, _getReturnStats(lead.id));
    res.json(lead);
});

// ===== SYSTEM CHANGE NOTIFICATION =====
function _broadcastSystemChange(userId, text) {
    const user = db.findOne('users', u => u.id === userId);
    const userName = user ? user.display_name : 'System';
    db.insert('admin_messages', {
        text: '🔔 ' + text,
        target_user_id: null,
        sender_id: 0,
        sender_name: '⚙️ Sistema',
        read_by: JSON.stringify([]),
        created_at: new Date().toISOString()
    });
}

// ===== RETURN STATS HELPER =====
function _getReturnStats(leadId) {
    const actions = db.findAll('lead_actions', a => a.lead_id === leadId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let returnTotal = 0, returnFromCallback = 0, returnFromSkip = 0, returnFromDocs = 0;
    // Count returns: whenever status goes back to 'new' after being processed
    for (let i = 1; i < actions.length; i++) {
        const act = actions[i].action_type;
        const prev = actions[i-1].action_type;
        if (act === 'status_change_new' || act === 'new') {
            if (prev === 'перезвон' || prev === 'callback' || prev === 'status_change_callback') {
                returnFromCallback++;
                returnTotal++;
            } else if (prev === 'скип_приветствие' || prev === 'skipped' || prev === 'status_change_skipped') {
                returnFromSkip++;
                returnTotal++;
            } else if (prev === 'срез_на_доках' || prev === 'docs' || prev === 'status_change_docs') {
                returnFromDocs++;
                returnTotal++;
            } else {
                // Any other return
                returnTotal++;
            }
        }
    }
    return { return_total: returnTotal, return_from_callback: returnFromCallback, return_from_skip: returnFromSkip, return_from_docs: returnFromDocs };
}

// Get ONE random lead for calling — permanent assignment per operator
app.get('/api/leads/next', requireAuth, (req, res) => {
    const userId = req.session.userId;

    // Get list of disabled base IDs
    const disabledBaseIds = db.findAll('bases', b => !b.enabled).map(b => b.id);

    // 1) First: check if this user already has a lead assigned (return it)
    const myLead = db.findOne('leads', l =>
        l.status === 'new' &&
        l.assigned_to === userId &&
        (!l.base_id || !disabledBaseIds.includes(l.base_id))
    );

    if (myLead) {
        const creator = db.findOne('users', u => u.id === myLead.created_by);
        myLead.creator_name = creator ? creator.display_name : 'Система';
        const base = myLead.base_id ? db.findOne('bases', b => b.id === myLead.base_id) : null;
        myLead.base_name = base ? base.name : 'СВО';
        try { myLead.relatives_parsed = JSON.parse(myLead.relatives || '[]'); } catch (e) { myLead.relatives_parsed = []; }
        // Add return stats
        Object.assign(myLead, _getReturnStats(myLead.id));
        return res.json(myLead);
    }

    // 2) No assigned lead — pick a random UNASSIGNED one
    let available = db.findAll('leads', l =>
        l.status === 'new' &&
        (!l.base_id || !disabledBaseIds.includes(l.base_id)) &&
        (l.assigned_to === null || l.assigned_to === undefined)
    );

    if (available.length === 0) {
        return res.json(null);
    }

    // ===== FRESH-FIRST PRIORITY (SVO) =====
    const freshFirstSvo = db.getSetting('fresh_first_svo') === '1';
    if (freshFirstSvo) {
        const bcc = {};
        available.forEach(l => {
            if (l.base_id && !bcc[l.base_id]) {
                const b = db.findOne('bases', x => x.id === l.base_id);
                bcc[l.base_id] = b ? (b.created_at || '') : '';
            }
        });
        available.sort((a, b) => (bcc[b.base_id] || '').localeCompare(bcc[a.base_id] || ''));
    }

    // ===== DEATH YEAR PRIORITY =====
    const priorityDeathYear = db.getSetting('priority_death_year') || '';
    let lead;
    if (priorityDeathYear) {
        // Sort: leads with matching death year first
        available.sort((a, b) => {
            const aYear = _extractDeathYear(a);
            const bYear = _extractDeathYear(b);
            const aMatch = aYear === priorityDeathYear ? 1 : 0;
            const bMatch = bYear === priorityDeathYear ? 1 : 0;
            return bMatch - aMatch;
        });
        lead = available[0]; // First = best priority
    } else if (freshFirstSvo) {
        lead = available[0];
    } else {
        // Random pick (no priority)
        lead = available[Math.floor(Math.random() * available.length)];
    }

    // Permanently assign to this user
    db.update('leads', l => l.id === lead.id, { assigned_to: userId, assigned_at: new Date().toISOString() });

    const creator = db.findOne('users', u => u.id === lead.created_by);
    lead.creator_name = creator ? creator.display_name : 'Система';
    const base = lead.base_id ? db.findOne('bases', b => b.id === lead.base_id) : null;
    lead.base_name = base ? base.name : 'СВО';
    try { lead.relatives_parsed = JSON.parse(lead.relatives || '[]'); } catch (e) { lead.relatives_parsed = []; }
    // Add return stats
    Object.assign(lead, _getReturnStats(lead.id));

    res.json(lead);
});

// Get count of my created leads + passed info
app.get('/api/leads/my-stats', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const myLeads = db.findAll('leads', l => l.created_by === userId);
    const total = myLeads.length;

    // Find which of my leads were passed by others
    const passedNotifications = [];
    myLeads.forEach(lead => {
        const passActions = db.findAll('lead_actions', a => a.lead_id === lead.id && a.action_type === 'передал');
        passActions.forEach(action => {
            const passer = db.findOne('users', u => u.id === action.user_id);
            passedNotifications.push({
                lead_name: lead.deceased_name,
                lead_id: lead.id,
                passed_by: passer ? passer.display_name : '—',
                comment: action.comment || '',
                date: action.created_at,
                region: lead.region || ''
            });
        });
    });

    // Count by status
    const byStatus = {};
    myLeads.forEach(l => {
        byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    });

    res.json({ total, byStatus, passed: passedNotifications.sort((a, b) => new Date(b.date) - new Date(a.date)) });
});

// Action on lead (with optional comment for передал)
app.post('/api/leads/:id/action', requireAuth, (req, res) => {
    const { action, comment } = req.body;
    const leadId = parseInt(req.params.id);
    const userId = req.session.userId;

    const validActions = ['не_дозвон', 'скип_приветствие', 'перезвон', 'передал', 'срез_на_доках', 'другой_человек'];
    if (!validActions.includes(action)) {
        return res.status(400).json({ error: 'Неизвестное действие' });
    }

    db.insert('lead_actions', {
        lead_id: leadId,
        user_id: userId,
        action_type: action,
        comment: comment || '',
        created_at: new Date().toISOString()
    });

    db.update('leads', l => l.id === leadId, { assigned_to: userId, last_comment: comment || '', last_comment_by: req.session.displayName || '', last_comment_at: new Date().toISOString() });

    const statusMap = {
        'перезвон': 'callback',
        'передал': 'passed',
        'срез_на_доках': 'docs',
        'не_дозвон': 'no_answer',
        'скип_приветствие': 'skipped',
        'другой_человек': 'other_person'
    };
    db.update('leads', l => l.id === leadId, { status: statusMap[action] || 'new' });

    if (action === 'перезвон') {
        const existing = db.findOne('callbacks', c => c.lead_id === leadId && c.user_id === userId);
        if (!existing) {
            db.insert('callbacks', { lead_id: leadId, user_id: userId, created_at: new Date().toISOString() });
        }
    }

    // Award 10 BorodaCoins on pass
    if (action === 'передал') {
        const user = db.findOne('users', u => u.id === userId);
        if (user) {
            db.update('users', u => u.id === userId, { coins: (user.coins || 0) + 10 });
        }
    }
    // Notify on significant actions
    if (action === 'передал') {
        const lead = db.findOne('leads', l => l.id === leadId);
        const user = db.findOne('users', u => u.id === userId);
        const userName = user ? user.display_name : 'Работник';
        _broadcastSystemChange(userId, userName + ' передал карточку #' + leadId + (lead ? ' (' + (lead.deceased_name || '') + ')' : '') + (comment ? ' — ' + comment : ''));
        pushAdminEvent('pass', '✅ ' + userName + ' передал карточку', lead ? (lead.deceased_name || '') : '');
        if (lead && lead.base_id) _checkBaseCompletion(lead.base_id, 'svo');
    }

    res.json({ ok: true });
});


// Worker: delete lead from base permanently
app.delete('/api/leads/:id', requireAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = db.findOne('leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Лид не найден' });
    const user = db.findOne('users', u => u.id === req.session.userId);
    const userName = user ? user.display_name : 'Работник';
    pushAdminEvent('delete', '🗑️ ' + userName + ' удалил карточку', lead.deceased_name || '#' + leadId);
    db.delete('leads', l => l.id === leadId);
    db.delete('lead_actions', a => a.lead_id === leadId);
    db.delete('callbacks', c => c.lead_id === leadId);
    res.json({ ok: true });
});

// Admin: change lead status
app.put('/api/admin/leads/:id/status', requireAdmin, (req, res) => {
    const leadId = parseInt(req.params.id);
    const { status } = req.body;
    const validStatuses = ['new', 'no_answer', 'callback', 'passed', 'docs', 'skipped', 'other_person'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Неизвестный статус' });
    }
    const lead = db.findOne('leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Лид не найден' });
    db.update('leads', l => l.id === leadId, { status });
    res.json({ ok: true });
});

// Admin: delete single lead
app.delete('/api/admin/leads/:id', requireAdmin, (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = db.findOne('leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Лид не найден' });
    db.delete('lead_actions', a => a.lead_id === leadId);
    db.delete('callbacks', c => c.lead_id === leadId);
    db.delete('leads', l => l.id === leadId);
    res.json({ ok: true });
});

// Admin: edit single lead
app.put('/api/admin/leads/:id', requireAdmin, (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = db.findOne('leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Лид не найден' });
    const { deceased_name, relatives, phones, address, region, extra_info, status } = req.body;
    const updates = {};
    if (deceased_name !== undefined) updates.deceased_name = deceased_name.trim();
    if (relatives !== undefined) updates.relatives = typeof relatives === 'string' ? relatives : JSON.stringify(relatives);
    if (phones !== undefined) updates.phones = phones;
    if (address !== undefined) updates.address = address;
    if (region !== undefined) updates.region = region;
    if (extra_info !== undefined) updates.extra_info = extra_info;
    if (status !== undefined) updates.status = status;
    db.update('leads', l => l.id === leadId, updates);
    res.json({ ok: true });
});

// My callbacks
app.get('/api/my-callbacks', requireAuth, (req, res) => {
    const callbacks = db.findAll('callbacks', c => c.user_id === req.session.userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const result = callbacks.map(c => {
        const lead = db.findOne('leads', l => l.id === c.lead_id);
        if (!lead) return null;
        const creator = db.findOne('users', u => u.id === lead.created_by);
        try { lead.relatives_parsed = JSON.parse(lead.relatives || '[]'); } catch (e) { lead.relatives_parsed = []; }
        return { ...lead, creator_name: creator ? creator.display_name : '—', callback_at: c.created_at };
    }).filter(Boolean);

    res.json(result);
});

app.delete('/api/my-callbacks/:leadId', requireAuth, (req, res) => {
    const leadId = parseInt(req.params.leadId);
    const userId = req.session.userId;
    db.delete('callbacks', c => c.lead_id === leadId && c.user_id === userId);
    // Return to this worker: set status='new' AND explicitly assign to this user
    db.update('leads', l => l.id === leadId, { status: 'new', assigned_to: userId, assigned_at: new Date().toISOString() });
    res.json({ ok: true });
});

// ============ STATUS ARCHIVE (SVO) ============
// Get action history for a lead
app.get('/api/leads/:id/history', requireAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const actions = db.findAll('lead_actions', a => a.lead_id === leadId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20);
    const result = actions.map(a => {
        const user = db.findOne('users', u => u.id === a.user_id);
        return { ...a, user_name: user ? user.display_name : '—' };
    });
    res.json(result);
});

// Change lead status (undo action) — for workers
app.post('/api/leads/:id/change-status', requireAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const { status } = req.body;
    const validStatuses = ['new', 'no_answer', 'callback', 'passed', 'docs', 'skipped'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const lead = db.findOne('leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const updateData = { status };
    if (status === 'new') {
        updateData.assigned_to = req.session.userId;
        updateData.assigned_at = new Date().toISOString();
    }
    db.update('leads', l => l.id === leadId, updateData);
    db.insert('lead_actions', {
        lead_id: leadId, user_id: req.session.userId,
        action_type: 'status_change_' + status, comment: 'Изменение статуса из архива',
        created_at: new Date().toISOString()
    });
    // Auto-archive: check return count after returning to 'new'
    if (status === 'new') {
        const stats = _getReturnStats(leadId);
        if (stats.return_total >= 10) {
            db.update('leads', l => l.id === leadId, { status: 'archived' });
            _broadcastSystemChange(req.session.userId, 'Карточка #' + leadId + ' (' + (lead.deceased_name || '') + ') автоматически отправлена в АРХИВ (10+ возвратов)');
            return res.json({ ok: true, archived: true, message: 'Карточка отправлена в архив (10+ возвратов)' });
        }
    }
    if (status === 'callback') {
        const existing = db.findOne('callbacks', c => c.lead_id === leadId && c.user_id === req.session.userId);
        if (!existing) db.insert('callbacks', { lead_id: leadId, user_id: req.session.userId, created_at: new Date().toISOString() });
    } else {
        db.delete('callbacks', c => c.lead_id === leadId && c.user_id === req.session.userId);
    }
    res.json({ ok: true });
});

// Delete a specific relative from a lead
app.post('/api/leads/:id/delete-relative', requireAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const { relativeIndex } = req.body;
    if (relativeIndex === undefined || relativeIndex === null) return res.status(400).json({ error: 'relativeIndex required' });
    const lead = db.findOne('leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    let relatives = [];
    try { relatives = JSON.parse(lead.relatives || '[]'); } catch(e) {}
    const idx = parseInt(relativeIndex);
    if (idx < 0 || idx >= relatives.length) return res.status(400).json({ error: 'Invalid index' });
    const removedName = relatives[idx].name || 'Неизвестный';
    relatives.splice(idx, 1);
    db.update('leads', l => l.id === leadId, { relatives: JSON.stringify(relatives) });
    // Log the deletion
    db.insert('lead_actions', {
        lead_id: leadId, user_id: req.session.userId,
        action_type: 'delete_relative', comment: 'Удалён родственник: ' + removedName,
        created_at: new Date().toISOString()
    });
    // Notify all workers about the change
    const worker = db.findOne('users', u => u.id === req.session.userId);
    const workerName = worker ? worker.display_name : 'Работник';
    _broadcastSystemChange(req.session.userId, workerName + ' удалил родственника "' + removedName + '" из карточки #' + leadId + ' (' + (lead.deceased_name || '') + ')');
    res.json({ ok: true, relatives });
});

// ============ ARCHIVED LEADS (10+ returns) ============
app.get('/api/leads/archived', requireAuth, (req, res) => {
    const archivedLeads = db.findAll('leads', l => l.status === 'archived');
    // Group by region
    const regionMap = {};
    archivedLeads.forEach(l => {
        const region = l.region || 'Без региона';
        if (!regionMap[region]) regionMap[region] = [];
        let relatives_parsed = [];
        try { relatives_parsed = JSON.parse(l.relatives || '[]'); } catch(e) {}
        const creator = db.findOne('users', u => u.id === l.created_by);
        const stats = _getReturnStats(l.id);
        regionMap[region].push({
            id: l.id,
            deceased_name: l.deceased_name,
            region: l.region || '',
            creator_name: creator ? creator.display_name : 'Система',
            relatives_parsed,
            ...stats,
            created_at: l.created_at
        });
    });
    const regions = Object.entries(regionMap).map(([region, leads]) => ({
        region, count: leads.length, leads
    })).sort((a, b) => b.count - a.count);
    res.json({ total: archivedLeads.length, regions });
});

// Delete phone from lead (SVO)
app.post('/api/leads/:id/delete-phone', requireAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const lead = db.findOne('leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    // Parse relatives to remove the phone
    let relatives = [];
    try { relatives = JSON.parse(lead.relatives || '[]'); } catch(e) {}
    const cleanPhone = phone.replace(/\D/g, '');
    relatives = relatives.map(r => {
        if (!r.phones) return r;
        r.phones = r.phones.filter(p => p.replace(/\D/g, '') !== cleanPhone);
        return r;
    });
    db.update('leads', l => l.id === leadId, { relatives: JSON.stringify(relatives) });
    res.json({ ok: true });
});

// ============ MY ARCHIVE — all processed leads by this worker ============
app.get('/api/my-archive', requireAuth, (req, res) => {
    const userId = req.session.userId;
    // Get all lead IDs this worker has acted on
    const myActions = db.findAll('lead_actions', a => a.user_id === userId);
    const leadIds = [...new Set(myActions.map(a => a.lead_id))];
    // Get leads that are NOT 'new' (already processed)
    const result = leadIds.map(lid => {
        const lead = db.findOne('leads', l => l.id === lid);
        if (!lead || lead.status === 'new') return null;
        const lastAction = myActions.filter(a => a.lead_id === lid).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const statusNames = { no_answer: '❌ Не дозвон', callback: '📞 Перезвон', passed: '✅ Передал', docs: '📄 Срез', skipped: '⏭ Скип', other_person: '👤 Другой' };
        let phones = [];
        try { const rels = JSON.parse(lead.relatives || '[]'); phones = rels.flatMap(r => r.phones || []); } catch(e) {}
        return {
            id: lead.id,
            name: lead.deceased_name || 'Без имени',
            status: lead.status,
            status_label: statusNames[lead.status] || lead.status,
            phones: phones.slice(0, 2),
            last_action: lastAction ? lastAction.action_type : '',
            last_action_at: lastAction ? lastAction.created_at : '',
            last_comment: lastAction ? lastAction.comment : ''
        };
    }).filter(Boolean).sort((a,b) => new Date(b.last_action_at) - new Date(a.last_action_at));
    res.json(result);
});

// ============ DELETE PHONE from SVO lead ============
app.post('/api/leads/:id/delete-phone', requireAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const lead = db.findOne('leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    try {
        let relatives = JSON.parse(lead.relatives || '[]');
        let removed = false;
        relatives = relatives.map(r => {
            if (r.phones && Array.isArray(r.phones)) {
                const before = r.phones.length;
                r.phones = r.phones.filter(p => p !== phone);
                if (r.phones.length < before) removed = true;
            }
            if (r.phone === phone) { r.phone = ''; removed = true; }
            return r;
        });
        if (removed) {
            db.update('leads', l => l.id === leadId, { relatives: JSON.stringify(relatives) });
        }
        res.json({ ok: true, removed });
    } catch(e) {
        res.status(500).json({ error: 'Parse error' });
    }
});

// ============ DELETE PHONE from Dept lead ============
app.post('/api/dept/leads/:id/delete-phone', requireDeptAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const lead = db.findOne('dept_leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    try {
        let data = typeof lead.data === 'string' ? JSON.parse(lead.data || '{}') : (lead.data || {});
        let removed = false;
        // Search all fields for phone number and remove
        for (const key of Object.keys(data)) {
            if (typeof data[key] === 'string' && data[key].includes(phone)) {
                // If field is just the phone, clear it; if it has multiple, remove just this one
                if (data[key].trim() === phone) {
                    data[key] = '';
                    removed = true;
                } else {
                    // Remove phone from comma/semicolon/space-separated list
                    const cleaned = data[key].replace(phone, '').replace(/[,;]\s*[,;]/g, ',').replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
                    if (cleaned !== data[key]) { data[key] = cleaned; removed = true; }
                }
            }
        }
        if (removed) {
            db.update('dept_leads', l => l.id === leadId, { data: JSON.stringify(data) });
        }
        res.json({ ok: true, removed });
    } catch(e) {
        res.status(500).json({ error: 'Parse error' });
    }
});

// Search
app.get('/api/search', requireAuth, (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json([]);

    const leads = db.findAll('leads', l =>
        (l.deceased_name && l.deceased_name.toLowerCase().includes(q)) ||
        (l.relatives && l.relatives.toLowerCase().includes(q))
    ).slice(0, 50);

    const result = leads.map(l => {
        const creator = db.findOne('users', u => u.id === l.created_by);
        try { l.relatives_parsed = JSON.parse(l.relatives || '[]'); } catch (e) { l.relatives_parsed = []; }
        return { ...l, creator_name: creator ? creator.display_name : '—' };
    });

    res.json(result);
});

// Base stats for all workers
app.get('/api/leads/base-stats', requireAuth, (req, res) => {
    const disabledBaseIds = db.findAll('bases', b => !b.enabled).map(b => b.id);
    const allLeads = db.findAll('leads', l => !l.base_id || !disabledBaseIds.includes(l.base_id));
    const total = allLeads.length;
    const remaining = allLeads.filter(l => l.status === 'new').length;
    const called = total - remaining;
    res.json({ total, remaining, called });
});

// Daily call stats (today's actions for current user + overall)
app.get('/api/leads/daily-stats', requireAuth, (req, res) => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const allActions = db.findAll('lead_actions', a => a.created_at && a.created_at.startsWith(today));
    const userId = req.session.userId;
    const isAdmin = req.session.role === 'admin';

    // My stats today
    const myActions = allActions.filter(a => a.user_id === userId);
    const my = {
        total: myActions.length,
        'не_дозвон': myActions.filter(a => a.action_type === 'не_дозвон').length,
        'скип_приветствие': myActions.filter(a => a.action_type === 'скип_приветствие').length,
        'перезвон': myActions.filter(a => a.action_type === 'перезвон').length,
        'передал': myActions.filter(a => a.action_type === 'передал').length,
        'срез_на_доках': myActions.filter(a => a.action_type === 'срез_на_доках').length,
        'другой_человек': myActions.filter(a => a.action_type === 'другой_человек').length
    };

    // Overall stats today
    const overall = {
        total: allActions.length,
        'не_дозвон': allActions.filter(a => a.action_type === 'не_дозвон').length,
        'скип_приветствие': allActions.filter(a => a.action_type === 'скип_приветствие').length,
        'перезвон': allActions.filter(a => a.action_type === 'перезвон').length,
        'передал': allActions.filter(a => a.action_type === 'передал').length,
        'срез_на_доках': allActions.filter(a => a.action_type === 'срез_на_доках').length,
        'другой_человек': allActions.filter(a => a.action_type === 'другой_человек').length
    };

    // Per-worker breakdown (for admins)
    let workers = [];
    if (isAdmin) {
        const userIds = [...new Set(allActions.map(a => a.user_id))];
        workers = userIds.map(uid => {
            const user = db.findOne('users', u => u.id === uid);
            const ua = allActions.filter(a => a.user_id === uid);
            return {
                user_id: uid,
                display_name: user ? user.display_name : '—',
                total: ua.length,
                'не_дозвон': ua.filter(a => a.action_type === 'не_дозвон').length,
                'скип_приветствие': ua.filter(a => a.action_type === 'скип_приветствие').length,
                'перезвон': ua.filter(a => a.action_type === 'перезвон').length,
                'передал': ua.filter(a => a.action_type === 'передал').length,
                'срез_на_доках': ua.filter(a => a.action_type === 'срез_на_доках').length
            };
        }).sort((a, b) => b.total - a.total);
    }

    res.json({ my, overall, workers, date: today });
});

// Sheet link
app.get('/api/sheet-link', requireAuth, (req, res) => {
    res.json({ link: db.getSetting('sheet_link') || '' });
});

// ============ ADMIN ============
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = db.findAll('users').map(u => ({
        id: u.id, username: u.username, display_name: u.display_name, role: u.role, created_at: u.created_at,
        rank_bonus: parseInt(db.getSetting('rank_bonus_' + u.id)) || 0,
        coins: u.coins || 0, owned_mascots: u.owned_mascots || []
    }));
    res.json(users);
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
    const { username, password, display_name, role } = req.body;
    const existing = db.findOne('users', u => u.username === username);
    if (existing) return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.insert('users', {
        username, password_hash: hash, display_name, role: role || 'worker',
        created_at: new Date().toISOString()
    });
    res.json({ id: result.lastInsertRowid });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    db.delete('users', u => u.id === id && u.id !== req.session.userId);
    res.json({ ok: true });
});

// Edit user (admin)
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const user = db.findOne('users', u => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = {};
    if (req.body.display_name) updates.display_name = req.body.display_name;
    if (req.body.role && (req.body.role === 'admin' || req.body.role === 'worker')) updates.role = req.body.role;
    if (req.body.password) updates.password_hash = bcrypt.hashSync(req.body.password, 10);

    if (req.body.rank_bonus !== undefined) {
        db.setSetting('rank_bonus_' + id, parseInt(req.body.rank_bonus) || 0);
    }

    if (Object.keys(updates).length > 0) {
        db.update('users', u => u.id === id, updates);
    }
    res.json({ ok: true });
});

// Operator call stats (personal + team totals + rank + medals + team feed)
app.get('/api/operator/my-call-stats', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const today = new Date().toISOString().slice(0, 10);

    const myActions = db.findAll('lead_actions', a => a.user_id === userId);
    const myToday = myActions.filter(a => a.created_at && a.created_at.startsWith(today));
    const allActions = db.findAll('lead_actions');
    const allLeads = db.findAll('leads');

    // My stats
    const myAllTime = {};
    myActions.forEach(a => { myAllTime[a.action_type] = (myAllTime[a.action_type] || 0) + 1; });
    const myTodayMap = {};
    myToday.forEach(a => { myTodayMap[a.action_type] = (myTodayMap[a.action_type] || 0) + 1; });

    // Global totals
    const globalMap = {};
    allActions.forEach(a => { globalMap[a.action_type] = (globalMap[a.action_type] || 0) + 1; });

    // === RANK SYSTEM ===
    const rankBonus = parseInt(db.getSetting('rank_bonus_' + userId)) || 0;
    const totalPassed = (myAllTime['передал'] || 0) + rankBonus;
    const ranks = [
        { name: 'Рядовой', min: 0, stars: 0, tier: 0 },
        { name: 'Ефрейтор', min: 3, stars: 1, tier: 1 },
        { name: 'Мл. Сержант', min: 8, stars: 1, tier: 2 },
        { name: 'Сержант', min: 15, stars: 2, tier: 2 },
        { name: 'Ст. Сержант', min: 25, stars: 3, tier: 2 },
        { name: 'Прапорщик', min: 40, stars: 2, tier: 3 },
        { name: 'Лейтенант', min: 60, stars: 1, tier: 4 },
        { name: 'Ст. Лейтенант', min: 85, stars: 2, tier: 4 },
        { name: 'Капитан', min: 120, stars: 3, tier: 4 },
        { name: 'Майор', min: 170, stars: 1, tier: 5 },
        { name: 'Подполковник', min: 250, stars: 2, tier: 5 },
        { name: 'Полковник', min: 350, stars: 3, tier: 5 },
        { name: 'Генерал-лейтенант', min: 500, stars: 4, tier: 6 }
    ];
    let currentRank = ranks[0];
    let nextRank = ranks[1];
    for (let i = ranks.length - 1; i >= 0; i--) {
        if (totalPassed >= ranks[i].min) { currentRank = ranks[i]; nextRank = ranks[i + 1] || null; break; }
    }
    const rankProgress = nextRank ? ((totalPassed - currentRank.min) / (nextRank.min - currentRank.min) * 100).toFixed(1) : 100;

    // === MEDALS ===
    const passedToday = myTodayMap['передал'] || 0;
    const medals = [];
    if (totalPassed >= 1) medals.push({ icon: '🎖️', name: 'Первая кровь', desc: 'Первая переданная трубка' });
    if (totalPassed >= 50) medals.push({ icon: '🏆', name: 'Ветеран', desc: '50 переданных трубок' });
    if (totalPassed >= 100) medals.push({ icon: '💎', name: 'Легенда', desc: '100 переданных трубок' });
    if (passedToday >= 3) medals.push({ icon: '🔥', name: 'Боевой дух', desc: '3 трубки за день' });
    if (passedToday >= 5) medals.push({ icon: '⭐', name: 'Герой дня', desc: '5 трубок за день' });
    if (passedToday >= 10) medals.push({ icon: '👑', name: 'Непобедимый', desc: '10 трубок за день' });

    // === TOP 5 LEADERBOARD (passes today) ===
    const todayPasses = allActions.filter(a => a.action_type === 'передал' && a.created_at && a.created_at.startsWith(today));
    const leaderMap = {};
    todayPasses.forEach(a => { leaderMap[a.user_id] = (leaderMap[a.user_id] || 0) + 1; });
    const top5 = Object.entries(leaderMap)
        .map(([uid, count]) => {
            const user = db.findOne('users', u => u.id === parseInt(uid));
            return { name: user ? user.display_name : '—', count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // === MY BASE PASSES (leads I created that others passed) ===
    const myCreatedLeads = allLeads.filter(l => l.created_by === userId);
    const myBasePassActions = allActions.filter(a => a.action_type === 'передал' && myCreatedLeads.some(l => l.id === a.lead_id));
    const myBasePasses = myBasePassActions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 15).map(a => {
        const user = db.findOne('users', u => u.id === a.user_id);
        const lead = db.findOne('leads', l => l.id === a.lead_id);
        return { userName: user ? user.display_name : '—', leadName: lead ? lead.deceased_name : '—', date: a.created_at };
    });

    res.json({
        today: { total: myToday.length, ...myTodayMap },
        allTime: { total: myActions.length, ...myAllTime },
        team: {
            total: allActions.length, ...globalMap,
            totalLeads: allLeads.length,
            remaining: allLeads.filter(l => l.status === 'new').length
        },
        rank: {
            name: currentRank.name, stars: currentRank.stars, tier: currentRank.tier,
            totalPassed, progress: parseFloat(rankProgress),
            nextRank: nextRank ? nextRank.name : null,
            nextMin: nextRank ? nextRank.min : null
        },
        medals,
        top5,
        myBasePasses
    });
});

// ============ MASCOT GEMINI API ============
const GEMINI_KEY = 'AIzaSyAIZvECMLdjf-MI-uTSBGWsG3f7TB0TqZo';
app.post('/api/mascot/chat', requireAuth, async (req, res) => {
    const { personality, message } = req.body;
    // Build context about user
    const user = db.findOne('users', u => u.id === req.session.userId);
    const userName = user ? user.display_name : 'Менеджер';
    const userCoins = user ? (user.coins || 0) : 0;
    const todayActions = db.findAll('lead_actions', a => a.user_id === req.session.userId && a.created_at && a.created_at.startsWith(new Date().toISOString().slice(0,10)));
    const passedToday = todayActions.filter(a => a.action_type === 'передал').length;
    const callsToday = todayActions.length;
    const context = `Имя менеджера: ${userName}. Коинов: ${userCoins}. Звонков сегодня: ${callsToday}. Передач сегодня: ${passedToday}.`;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${personality}\nКонтекст: ${context}\nОтвечай на русском. Можешь шутить, давать советы по продажам, подбадривать, рассказывать короткие анекдоты. Будь живым и веселым.\n\nUser: ${message}` }] }],
                generationConfig: { maxOutputTokens: 150, temperature: 0.95 }
            })
        });
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '...';
        res.json({ text: text.slice(0, 300) });
    } catch (e) {
        res.json({ text: '🤖 Не могу ответить...' });
    }
});

// ============ BORODACOIN API ============
const MASCOT_PRICES = { soldier: 150, donatello: 200, major: 270, splinter: 300, vader: 350, bmw: 650, vodovoz: 400, wolf: 800, devil: 900, bear: 550, knight: 700, reaper: 1000 };

app.get('/api/coins', requireAuth, (req, res) => {
    const user = db.findOne('users', u => u.id === req.session.userId);
    res.json({ coins: user?.coins || 0, owned_mascots: user?.owned_mascots || [] });
});

app.post('/api/coins/buy-mascot', requireAuth, (req, res) => {
    const { mascotId } = req.body;
    const price = MASCOT_PRICES[mascotId];
    if (!price) return res.status(400).json({ error: 'Неизвестный талисман' });
    const user = db.findOne('users', u => u.id === req.session.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const coins = user.coins || 0;
    const owned = user.owned_mascots || [];
    if (owned.includes(mascotId)) return res.status(400).json({ error: 'Уже куплен' });
    if (coins < price) return res.status(400).json({ error: 'Недостаточно коинов', need: price, have: coins });
    owned.push(mascotId);
    db.update('users', u => u.id === req.session.userId, { coins: coins - price, owned_mascots: owned });
    res.json({ ok: true, coins: coins - price, owned_mascots: owned });
});

app.post('/api/admin/coins', requireAdmin, (req, res) => {
    const { userId, amount } = req.body;
    const user = db.findOne('users', u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const newCoins = Math.max(0, (user.coins || 0) + amount);
    db.update('users', u => u.id === userId, { coins: newCoins });
    res.json({ ok: true, coins: newCoins });
});

// Roulette spin
app.post('/api/roulette/spin', requireAuth, (req, res) => {
    const user = db.findOne('users', u => u.id === req.session.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const coins = user.coins || 0;
    if (coins < 50) return res.status(400).json({ error: 'Недостаточно коинов', need: 50, have: coins });
    // Deduct 50
    let newCoins = coins - 50;
    const owned = user.owned_mascots || [];
    // Prize logic
    const roll = Math.random() * 100;
    let prize = null;
    if (roll < 30) {
        // 30% - nothing
        prize = { type: 'nothing' };
    } else if (roll < 50) {
        // 20% - 1-5 coins
        const amt = [1, 1, 2, 3, 5][Math.floor(Math.random() * 5)];
        newCoins += amt;
        prize = { type: 'coins', amount: amt };
    } else if (roll < 65) {
        // 15% - 11-20 coins
        const amt = [11, 15, 17, 20][Math.floor(Math.random() * 4)];
        newCoins += amt;
        prize = { type: 'coins', amount: amt };
    } else if (roll < 78) {
        // 13% - 50 coins
        newCoins += 50;
        prize = { type: 'coins', amount: 50 };
    } else if (roll < 88) {
        // 10% - 99-100 coins
        const amt = [99, 100][Math.floor(Math.random() * 2)];
        newCoins += amt;
        prize = { type: 'coins', amount: amt };
    } else if (roll < 95) {
        // 7% - 500 coins
        newCoins += 500;
        prize = { type: 'coins', amount: 500 };
    } else if (roll < 98) {
        // 3% - 100 coins
        newCoins += 100;
        prize = { type: 'coins', amount: 100 };
    } else if (roll < 99.5) {
        // 1.5% - random mascot
        const allIds = Object.keys(MASCOT_PRICES);
        const unowned = allIds.filter(id => !owned.includes(id));
        if (unowned.length > 0) {
            const wonId = unowned[Math.floor(Math.random() * unowned.length)];
            owned.push(wonId);
            prize = { type: 'mascot', mascotId: wonId };
        } else {
            newCoins += 200;
            prize = { type: 'coins', amount: 200 };
        }
    } else {
        // 0.5% - JACKPOT 1000!
        newCoins += 1000;
        prize = { type: 'coins', amount: 1000, jackpot: true };
    }
    db.update('users', u => u.id === req.session.userId, { coins: newCoins, owned_mascots: owned });
    res.json({ ok: true, prize: prize, coins: newCoins, owned_mascots: owned });
});
// Notepad (per-user)
app.get('/api/notepad', requireAuth, (req, res) => {
    const key = 'notepad_' + req.session.userId;
    res.json({ text: db.getSetting(key) || '' });
});
app.post('/api/notepad', requireAuth, (req, res) => {
    const key = 'notepad_' + req.session.userId;
    db.setSetting(key, req.body.text || '');
    res.json({ ok: true });
});

// ============ BASE MANAGEMENT ============

// CSV upload (legacy, admin only)
app.post('/api/admin/upload-base', requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const baseName = req.body.name || req.file.originalname;
    const baseResult = db.insert('bases', {
        name: baseName, enabled: 1, uploaded_by: req.session.userId, created_at: new Date().toISOString()
    });
    const baseId = baseResult.lastInsertRowid;

    const content = fs.readFileSync(req.file.path, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    // Pre-build fast index
    const allExisting = db.findAll('leads');
    const existingNames = new Set();
    const existingPhones = new Set();
    for (const l of allExisting) {
        if (l.deceased_name) existingNames.add(l.deceased_name.toLowerCase().trim());
        if (l.phones) { const c = l.phones.replace(/[^0-9]/g, ''); if (c) existingPhones.add(c); }
    }

    let imported = 0, duplicates = 0;

    db.beginBatch();

    for (const line of lines) {
        const parts = line.split(';').map(s => s.trim());
        const deceasedName = parts[0] || '';
        if (!deceasedName) continue;

        const phonesClean = (parts[3] || '').replace(/[^0-9]/g, '');
        if (existingNames.has(deceasedName.toLowerCase().trim()) || (phonesClean && existingPhones.has(phonesClean))) {
            duplicates++; continue;
        }

        db.insert('leads', {
            deceased_name: deceasedName,
            relatives: JSON.stringify(parts[1] ? [{ name: parts[1], relationship: parts[2] || '' }] : []),
            phones: parts[3] || '',
            address: parts[4] || '',
            extra_info: parts[5] || '',
            region: parts[6] || '',
            created_by: req.session.userId,
            status: 'new', assigned_to: null, source: 'uploaded', base_id: baseId,
            created_at: new Date().toISOString()
        });
        existingNames.add(deceasedName.toLowerCase().trim());
        if (phonesClean) existingPhones.add(phonesClean);
        imported++;
    }

    fs.unlinkSync(req.file.path);
    db.endBatch();
    res.json({ imported, duplicates, base_id: baseId });
});

// JSON base upload (available to ALL authenticated users)
app.post('/api/upload-base-json', requireAuth, (req, res) => {
    const { name, leads, auto_region } = req.body;
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ error: 'Массив лидов пуст или отсутствует' });
    }

    let imported = 0, duplicates = 0;
    const regionReport = {};

    // === PRE-BUILD FAST DUPLICATE INDEX (O(n) once instead of O(n) per lead) ===
    const allExisting = db.findAll('leads');
    const existingNames = new Set();
    const existingPhones = new Set();
    for (const l of allExisting) {
        if (l.deceased_name) existingNames.add(l.deceased_name.toLowerCase().trim());
        if (l.phones) {
            const clean = l.phones.replace(/[^0-9]/g, '');
            if (clean) existingPhones.add(clean);
        }
    }

    // Fast duplicate check using Sets
    const isDuplicate = (deceasedName, phones) => {
        if (deceasedName && existingNames.has(deceasedName.toLowerCase().trim())) return true;
        if (phones) {
            const clean = phones.replace(/[^0-9]/g, '');
            if (clean && existingPhones.has(clean)) return true;
        }
        return false;
    };

    // Add to index after inserting (so new leads also deduplicate against each other)
    const addToIndex = (deceasedName, phones) => {
        if (deceasedName) existingNames.add(deceasedName.toLowerCase().trim());
        if (phones) {
            const clean = phones.replace(/[^0-9]/g, '');
            if (clean) existingPhones.add(clean);
        }
    };

    const buildRelatives = (lead) => {
        if (Array.isArray(lead.relatives)) {
            return JSON.stringify(lead.relatives.map(r => ({
                name: r.name || '', relationship: r.relationship || '', phone: r.phone || '', address: r.address || ''
            })));
        }
        return '[]';
    };

    db.beginBatch(); // Defer all saves until done
    if (auto_region) {
        // === AUTO-REGION MODE: split leads by region ===
        const regionGroups = {};
        for (const lead of leads) {
            const region = (lead.region || '').trim() || 'Без региона';
            if (!regionGroups[region]) regionGroups[region] = [];
            regionGroups[region].push(lead);
        }

        for (const [region, regionLeads] of Object.entries(regionGroups)) {
            let base = db.findOne('bases', b => b.name === region);
            let baseId;
            let isNew = false;
            if (base) {
                baseId = base.id;
            } else {
                const result = db.insert('bases', {
                    name: region, enabled: 1, uploaded_by: req.session.userId, created_at: new Date().toISOString()
                });
                baseId = result.lastInsertRowid;
                isNew = true;
            }

            let regionImported = 0, regionDuplicates = 0;
            for (const lead of regionLeads) {
                const deceasedName = (lead.deceased_name || '').trim();
                if (!deceasedName) continue;
                if (isDuplicate(deceasedName, lead.phones || '')) { regionDuplicates++; duplicates++; continue; }

                db.insert('leads', {
                    deceased_name: deceasedName, relatives: buildRelatives(lead), phones: lead.phones || '',
                    address: lead.address || '', extra_info: lead.extra_info || '',
                    region: lead.region || '', created_by: req.session.userId,
                    status: 'new', assigned_to: null, source: 'base_upload',
                    base_id: baseId, created_at: new Date().toISOString()
                });
                addToIndex(deceasedName, lead.phones || '');
                regionImported++;
                imported++;
            }
            regionReport[region] = { imported: regionImported, duplicates: regionDuplicates, is_new: isNew };
        }

        console.log(`JSON Auto-Region Upload: ${Object.keys(regionGroups).length} regions, ${imported} imported, ${duplicates} duplicates`);
        db.endBatch(); // Save all at once
        res.json({ imported, duplicates, auto_region: true, regions: regionReport });

    } else {
        // === CLASSIC MODE: single base ===
        const baseName = name || ('База ' + new Date().toLocaleDateString('ru-RU'));
        const baseResult = db.insert('bases', {
            name: baseName, enabled: 1, uploaded_by: req.session.userId, created_at: new Date().toISOString()
        });
        const baseId = baseResult.lastInsertRowid;

        for (const lead of leads) {
            const deceasedName = (lead.deceased_name || '').trim();
            if (!deceasedName) continue;
            if (isDuplicate(deceasedName, lead.phones || '')) { duplicates++; continue; }

            db.insert('leads', {
                deceased_name: deceasedName, relatives: buildRelatives(lead), phones: lead.phones || '',
                address: lead.address || '', extra_info: lead.extra_info || '',
                region: lead.region || '', created_by: req.session.userId,
                status: 'new', assigned_to: null, source: 'base_upload',
                base_id: baseId, created_at: new Date().toISOString()
            });
            addToIndex(deceasedName, lead.phones || '');
            imported++;
        }

        console.log(`JSON Base Upload: "${baseName}" — ${imported} imported, ${duplicates} duplicates skipped`);
        db.endBatch(); // Save all at once
        res.json({ imported, duplicates, base_id: baseId, base_name: baseName });
    }
});

// Regroup ALL existing leads by region (one-time migration, safe to re-run)
app.post('/api/admin/regroup-bases', requireAdmin, (req, res) => {
    try {
        const allLeads = db.findAll('leads');
        console.log(`Regroup START: ${allLeads.length} total leads`);

        // STEP 1: Group all leads by their region field
        const regionGroups = {};
        allLeads.forEach(lead => {
            const region = (lead.region || '').trim() || 'Без региона';
            if (!regionGroups[region]) regionGroups[region] = [];
            regionGroups[region].push(lead);
        });

        const report = {};
        let moved = 0;
        const usedBaseIds = new Set(); // track which base IDs are in use

        // STEP 2: For each region, find or create ONE base
        for (const [region, regionLeads] of Object.entries(regionGroups)) {
            // Find ALL bases with this exact name (catch duplicates)
            const matchingBases = db.findAll('bases', b => b.name === region);
            let baseId;
            let isNew = false;

            if (matchingBases.length > 0) {
                // Use the FIRST matching base, mark others for cleanup
                baseId = matchingBases[0].id;
            } else {
                // No base exists for this region — create one
                const result = db.insert('bases', {
                    name: region, enabled: 1, uploaded_by: req.session.userId,
                    created_at: new Date().toISOString()
                });
                baseId = result.lastInsertRowid;
                isNew = true;
            }

            usedBaseIds.add(baseId);

            // STEP 3: Move ALL leads of this region to this base
            let movedInRegion = 0;
            regionLeads.forEach(lead => {
                if (lead.base_id !== baseId) {
                    db.update('leads', l => l.id === lead.id, { base_id: baseId });
                    movedInRegion++;
                    moved++;
                }
            });

            report[region] = { total: regionLeads.length, moved: movedInRegion, is_new: isNew };
            console.log(`  Region "${region}": ${regionLeads.length} leads, ${movedInRegion} moved, base_id=${baseId}${isNew ? ' (NEW)' : ''}`);
        }

        // STEP 4: DELETE all bases that have ZERO leads (thorough cleanup)
        const allBases = db.findAll('bases');
        let deletedBases = 0;
        const deletedNames = [];
        allBases.forEach(base => {
            const leadsInBase = db.findAll('leads', l => l.base_id === base.id);
            if (leadsInBase.length === 0) {
                db.delete('bases', b => b.id === base.id);
                deletedBases++;
                deletedNames.push(base.name);
            }
        });

        console.log(`Regroup DONE: ${Object.keys(regionGroups).length} regions, ${moved} leads moved, ${deletedBases} empty bases deleted`);
        if (deletedNames.length) console.log(`  Deleted bases: ${deletedNames.join(', ')}`);

        res.json({ ok: true, regions: report, moved, deleted_bases: deletedBases, deleted_names: deletedNames });
    } catch (err) {
        console.error('Regroup ERROR:', err);
        res.status(500).json({ error: 'Ошибка перегруппировки: ' + err.message });
    }
});

// List bases with per-status statistics (admin)
app.get('/api/admin/bases', requireAdmin, (req, res) => {
    const bases = db.findAll('bases').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const result = bases.map(b => {
        const uploader = db.findOne('users', u => u.id === b.uploaded_by);
        const baseLeads = db.findAll('leads', l => l.base_id === b.id);
        const total = baseLeads.length;
        const stats = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0 };
        baseLeads.forEach(l => { if (stats[l.status] !== undefined) stats[l.status]++; });
        const processed = total - stats.new;
        const progress = total > 0 ? ((processed / total) * 100).toFixed(1) : 0;
        return {
            ...b,
            uploader_name: uploader ? uploader.display_name : '—',
            lead_count: total,
            stats,
            processed,
            progress: parseFloat(progress)
        };
    });
    res.json(result);
});

// SVO Dashboard — full stats for admin panel
app.get('/api/admin/svo-dashboard', requireAdmin, (req, res) => {
    const bases = db.findAll('bases').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const basesData = bases.map(b => {
        const baseLeads = db.findAll('leads', l => l.base_id === b.id);
        const total = baseLeads.length;
        const stats = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0 };
        baseLeads.forEach(l => { if (stats[l.status] !== undefined) stats[l.status]++; });
        const processed = total - stats.new;
        const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
        return { id: b.id, name: b.name, enabled: b.enabled, total, stats, processed, progress, created_at: b.created_at };
    });

    const totalLeads = basesData.reduce((s, b) => s + b.total, 0);
    const totalRemaining = basesData.reduce((s, b) => s + (b.stats.new || 0), 0);
    const totalNoAnswer = basesData.reduce((s, b) => s + (b.stats.no_answer || 0), 0);
    const totalPassed = basesData.reduce((s, b) => s + (b.stats.passed || 0), 0);
    const totalCallback = basesData.reduce((s, b) => s + (b.stats.callback || 0), 0);
    const totalSkipped = basesData.reduce((s, b) => s + (b.stats.skipped || 0), 0);
    const totalBases = basesData.length;
    const enabledBases = basesData.filter(b => b.enabled).length;

    // Daily stats (last 30 days)
    const dailyStats = [];
    const allLeads = db.findAll('leads');
    const allActions = db.findAll('lead_actions');
    for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().slice(0, 10);
        const dayActions = allActions.filter(a => a.created_at && a.created_at.slice(0, 10) === dayStr);
        const dayPassed = dayActions.filter(a => a.action_type === 'передал').length;
        const dayNoAnswer = dayActions.filter(a => a.action_type === 'не_дозвон').length;
        const dayCallback = dayActions.filter(a => a.action_type === 'перезвон').length;
        const daySkipped = dayActions.filter(a => a.action_type === 'скип' || a.action_type === 'скип_приветствие').length;
        const dayTotal = dayActions.length;
        dailyStats.push({ date: dayStr, total: dayTotal, passed: dayPassed, no_answer: dayNoAnswer, callback: dayCallback, skipped: daySkipped });
    }

    res.json({
        bases: basesData,
        summary: { totalBases, enabledBases, totalLeads, totalRemaining, totalNoAnswer, totalPassed, totalCallback, totalSkipped },
        dailyStats
    });
});

// Return ALL SVO no_answer leads back to 'new'
app.post('/api/admin/svo-bases/return-all-no-answer', requireAdmin, (req, res) => {
    const noAnswerLeads = db.findAll('leads', l => l.status === 'no_answer');
    let count = 0;
    noAnswerLeads.forEach(lead => {
        db.update('leads', l => l.id === lead.id, { status: 'new', assigned_to: null });
        count++;
    });
    res.json({ ok: true, reset: count });
});

// Return SVO leads of specific status for a specific base back to 'new'
app.post('/api/admin/svo-bases/:id/return-leads', requireAdmin, (req, res) => {
    const baseId = parseInt(req.params.id);
    const { status } = req.body;
    const leads = db.findAll('leads', l => l.base_id === baseId && l.status === status);
    let count = 0;
    leads.forEach(lead => {
        db.update('leads', l => l.id === lead.id, { status: 'new', assigned_to: null });
        count++;
    });
    res.json({ ok: true, reset: count });
});

// ============ SVO GROUPED BY DATE ============
app.get('/api/admin/svo-grouped', requireAdmin, (req, res) => {
    const bases = db.findAll('bases').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const allBasesRaw = bases.map(b => {
        const baseLeads = db.findAll('leads', l => l.base_id === b.id);
        const total = baseLeads.length;
        const stats = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0 };
        baseLeads.forEach(l => { if (stats[l.status] !== undefined) stats[l.status]++; });
        const processed = total - stats.new;
        const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
        return { id: b.id, name: b.name, enabled: b.enabled, total, stats, processed, progress, created_at: b.created_at };
    });

    // Group by date
    const dayGroups = {};
    allBasesRaw.forEach(b => {
        const day = (b.created_at || '').slice(0, 10) || 'unknown';
        if (!dayGroups[day]) dayGroups[day] = [];
        dayGroups[day].push(b);
    });

    const days = Object.keys(dayGroups).sort((a, b) => b.localeCompare(a)).map(day => {
        const bases = dayGroups[day];
        const totalLeads = bases.reduce((s, b) => s + b.total, 0);
        const totalNew = bases.reduce((s, b) => s + (b.stats.new || 0), 0);
        const totalNA = bases.reduce((s, b) => s + (b.stats.no_answer || 0), 0);
        const totalPassed = bases.reduce((s, b) => s + (b.stats.passed || 0), 0);
        const totalCB = bases.reduce((s, b) => s + (b.stats.callback || 0), 0);
        const totalSkipped = bases.reduce((s, b) => s + (b.stats.skipped || 0), 0);
        const processed = totalLeads - totalNew;
        const progress = totalLeads > 0 ? Math.round((processed / totalLeads) * 100) : 0;
        const allEnabled = bases.every(b => b.enabled);
        const someEnabled = bases.some(b => b.enabled);
        return {
            date: day, baseCount: bases.length, totalLeads, totalNew, totalNA, totalPassed,
            totalCB, totalSkipped, processed, progress, allEnabled, someEnabled,
            bases: bases.sort((a, b) => (b.stats.passed || 0) - (a.stats.passed || 0))
        };
    });

    const globalLeads = allBasesRaw.reduce((s, b) => s + b.total, 0);
    const globalNew = allBasesRaw.reduce((s, b) => s + (b.stats.new || 0), 0);
    const globalNA = allBasesRaw.reduce((s, b) => s + (b.stats.no_answer || 0), 0);
    const globalPassed = allBasesRaw.reduce((s, b) => s + (b.stats.passed || 0), 0);
    const globalCB = allBasesRaw.reduce((s, b) => s + (b.stats.callback || 0), 0);
    const globalSkipped = allBasesRaw.reduce((s, b) => s + (b.stats.skipped || 0), 0);
    const globalBases = allBasesRaw.length;
    const globalEnabled = allBasesRaw.filter(b => b.enabled).length;
    const freshFirst = db.getSetting('fresh_first_svo') === '1';

    // Daily actions (last 30 days)
    const dailyStats = [];
    const allActions = db.findAll('lead_actions');
    for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().slice(0, 10);
        const dayActions = allActions.filter(a => a.created_at && a.created_at.slice(0, 10) === dayStr);
        dailyStats.push({
            date: dayStr,
            total: dayActions.length,
            passed: dayActions.filter(a => a.action_type === 'передал').length,
            no_answer: dayActions.filter(a => a.action_type === 'не_дозвон').length,
            callback: dayActions.filter(a => a.action_type === 'перезвон').length,
            skipped: dayActions.filter(a => a.action_type === 'скип' || a.action_type === 'скип_приветствие').length
        });
    }

    res.json({
        days,
        summary: { globalLeads, globalNew, globalNA, globalPassed, globalCB, globalSkipped, globalBases, globalEnabled },
        freshFirst,
        dailyStats
    });
});

// Toggle all SVO bases of a specific day
app.post('/api/admin/svo-day/toggle', requireAdmin, (req, res) => {
    const { date, enabled } = req.body;
    const bases = db.findAll('bases', b => b.created_at && b.created_at.slice(0, 10) === date);
    let count = 0;
    bases.forEach(b => {
        db.update('bases', x => x.id === b.id, { enabled: enabled ? 1 : 0 });
        count++;
    });
    res.json({ ok: true, toggled: count, enabled });
});

// Return all SVO no_answer leads for bases of a specific day
app.post('/api/admin/svo-day/return-no-answer', requireAdmin, (req, res) => {
    const { date } = req.body;
    const bases = db.findAll('bases', b => b.created_at && b.created_at.slice(0, 10) === date);
    let count = 0;
    bases.forEach(base => {
        const leads = db.findAll('leads', l => l.base_id === base.id && l.status === 'no_answer');
        leads.forEach(lead => {
            db.update('leads', l => l.id === lead.id, { status: 'new', assigned_to: null });
            count++;
        });
    });
    res.json({ ok: true, reset: count });
});

// Toggle fresh-first priority for SVO
app.post('/api/admin/svo-fresh-priority', requireAdmin, (req, res) => {
    const { enabled } = req.body;
    db.setSetting('fresh_first_svo', enabled ? '1' : '0');
    res.json({ ok: true, enabled });
});

// Export base as JSON (admin)
app.get('/api/admin/bases/:id/export', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });

    const baseLeads = db.findAll('leads', l => l.base_id === id);
    const exportData = baseLeads.map(l => {
        let relatives = [];
        try { relatives = JSON.parse(l.relatives || '[]'); } catch (e) {}
        return {
            deceased_name: l.deceased_name || '',
            relatives,
            phones: l.phones || '',
            address: l.address || '',
            extra_info: l.extra_info || '',
            region: l.region || '',
            status: l.status || 'new'
        };
    });

    const shouldDelete = req.query.delete === 'true';
    if (shouldDelete) {
        db.delete('lead_actions', a => baseLeads.some(l => l.id === a.lead_id));
        db.delete('callbacks', c => baseLeads.some(l => l.id === c.lead_id));
        db.delete('leads', l => l.base_id === id);
        db.delete('bases', b => b.id === id);
        console.log(`Base Export+Delete: "${base.name}" — ${baseLeads.length} leads exported and deleted`);
    }

    const fname = `base_${base.name.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '_')}_${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
    res.send(JSON.stringify(exportData, null, 2));
});

// Get lead counts per status (filtered by region + date)
app.get('/api/admin/leads/counts', requireAdmin, (req, res) => {
    const { region, date_from, date_to } = req.query;
    let leads = db.findAll('leads');
    if (region) leads = leads.filter(l => l.region === region);
    if (date_from) leads = leads.filter(l => l.created_at && l.created_at.slice(0,10) >= date_from);
    if (date_to) leads = leads.filter(l => l.created_at && l.created_at.slice(0,10) <= date_to);
    const counts = { all: leads.length, new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0, other_person: 0 };
    leads.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++; });
    res.json(counts);
});

// Reset ALL leads of a specific status back to 'new' (global, optionally filtered by region + date)
app.post('/api/admin/leads/reset-status', requireAdmin, (req, res) => {
    const { status, region, date_from, date_to } = req.body;
    const validStatuses = ['no_answer', 'callback', 'passed', 'docs', 'skipped'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Неизвестный статус для сброса' });
    }

    let leadsToReset = db.findAll('leads', l => l.status === status);
    if (region) leadsToReset = leadsToReset.filter(l => l.region === region);
    if (date_from) leadsToReset = leadsToReset.filter(l => l.created_at && l.created_at.slice(0,10) >= date_from);
    if (date_to) leadsToReset = leadsToReset.filter(l => l.created_at && l.created_at.slice(0,10) <= date_to);

    if (leadsToReset.length === 0) {
        return res.json({ ok: true, reset: 0 });
    }

    leadsToReset.forEach(lead => {
        db.delete('lead_actions', a => a.lead_id === lead.id);
        db.delete('callbacks', c => c.lead_id === lead.id);
        db.update('leads', l => l.id === lead.id, { status: 'new', assigned_to: null });
    });

    const statusNames = { no_answer: 'Не дозвон', skipped: 'Скип', callback: 'Перезвон', passed: 'Передал', docs: 'Срез на доках' };
    console.log(`Global Reset: ${leadsToReset.length} leads with status "${statusNames[status]}"${region ? ` in region "${region}"` : ''} reset to new`);
    res.json({ ok: true, reset: leadsToReset.length });
});

// Reset leads of a specific status back to 'new' within a base
app.post('/api/admin/bases/:id/reset-status', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    const validStatuses = ['no_answer', 'callback', 'passed', 'docs', 'skipped'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Неизвестный статус для сброса' });
    }

    const base = db.findOne('bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });

    const leadsToReset = db.findAll('leads', l => l.base_id === id && l.status === status);
    if (leadsToReset.length === 0) {
        return res.json({ ok: true, reset: 0 });
    }

    // Reset each lead: status -> new, clear assigned_to, remove actions & callbacks
    leadsToReset.forEach(lead => {
        db.delete('lead_actions', a => a.lead_id === lead.id);
        db.delete('callbacks', c => c.lead_id === lead.id);
        db.update('leads', l => l.id === lead.id, { status: 'new', assigned_to: null });
    });

    const statusNames = { no_answer: 'Не дозвон', skipped: 'Скип', callback: 'Перезвон', passed: 'Передал', docs: 'Срез на доках' };
    console.log(`Base Reset: "${base.name}" — ${leadsToReset.length} leads with status "${statusNames[status]}" reset to new`);
    res.json({ ok: true, reset: leadsToReset.length });
});

app.post('/api/admin/bases/:id/toggle', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    db.update('bases', b => b.id === id, { enabled: base.enabled ? 0 : 1 });
    res.json({ ok: true });
});

app.delete('/api/admin/bases/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const baseLeads = db.findAll('leads', l => l.base_id === id);
    db.delete('lead_actions', a => baseLeads.some(l => l.id === a.lead_id));
    db.delete('callbacks', c => baseLeads.some(l => l.id === c.lead_id));
    db.delete('leads', l => l.base_id === id);
    db.delete('bases', b => b.id === id);
    res.json({ ok: true });
});

// === СВО Base Detail View (same concept as dept-bases) ===

// Base detail with all leads + status breakdown
app.get('/api/admin/bases/:id/detail', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    let leads = db.findAll('leads', l => l.base_id === id);
    // Optional sub-status filter
    const subStatus = req.query.sub_status;
    if (subStatus) leads = leads.filter(l => l.status === subStatus);
    // Enrich leads
    const enrichedLeads = leads.map(l => {
        const creator = db.findOne('users', u => u.id === l.created_by);
        const assigned = db.findOne('users', u => u.id === l.assigned_to);
        let relatives_parsed = [];
        try { relatives_parsed = JSON.parse(l.relatives || '[]'); } catch(e) {}
        return { ...l, creator_name: creator ? creator.display_name : '—', assigned_name: assigned ? assigned.display_name : '—', relatives_parsed };
    });
    // Full status breakdown (always from ALL leads in base)
    const allLeads = db.findAll('leads', l => l.base_id === id);
    const statusBreakdown = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0, other_person: 0 };
    allLeads.forEach(l => { if (statusBreakdown[l.status] !== undefined) statusBreakdown[l.status]++; });
    res.json({ ...base, leads: enrichedLeads, statusBreakdown, total_leads: allLeads.length });
});

// Save field settings for СВО base
app.put('/api/admin/bases/:id/settings', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const { field_settings } = req.body;
    if (!field_settings) return res.status(400).json({ error: 'field_settings обязателен' });
    db.update('bases', b => b.id === id, { field_settings: JSON.stringify(field_settings) });
    res.json({ ok: true });
});

// Detailed СВО base statistics (same as dept-bases stats)
app.get('/api/admin/bases/:id/stats', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const leads = db.findAll('leads', l => l.base_id === id);
    const leadIds = new Set(leads.map(l => l.id));
    const actions = db.findAll('lead_actions', a => leadIds.has(a.lead_id));
    // Status breakdown
    const statusBreakdown = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0, other_person: 0 };
    leads.forEach(l => { if (statusBreakdown[l.status] !== undefined) statusBreakdown[l.status]++; });
    // Daily activity (last 14 days)
    const dailyActivity = {};
    for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        dailyActivity[d.toISOString().slice(0, 10)] = 0;
    }
    actions.forEach(a => {
        const day = (a.created_at || '').slice(0, 10);
        if (dailyActivity[day] !== undefined) dailyActivity[day]++;
    });
    // Per-worker stats
    const workerMap = {};
    actions.forEach(a => {
        if (!workerMap[a.user_id]) {
            const u = db.findOne('users', u => u.id === a.user_id);
            workerMap[a.user_id] = { user_id: a.user_id, name: u ? u.display_name : '?', total: 0, actions: {} };
        }
        workerMap[a.user_id].total++;
        workerMap[a.user_id].actions[a.action_type] = (workerMap[a.user_id].actions[a.action_type] || 0) + 1;
    });
    const workers = Object.values(workerMap).sort((a, b) => b.total - a.total);
    const processed = leads.length - statusBreakdown.new;
    res.json({
        total: leads.length, processed, remaining: statusBreakdown.new,
        progress: leads.length ? Math.round((processed / leads.length) * 100) : 0,
        statusBreakdown, dailyActivity, workers, total_actions: actions.length
    });
});

// Stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const { date, date_from, date_to } = req.query;
    const allUsers = db.findAll('users');
    let allActions = db.findAll('lead_actions');
    const allLeads = db.findAll('leads');

    // Optional date filter for actions
    let filteredActions = allActions;
    if (date) {
        filteredActions = allActions.filter(a => a.created_at && a.created_at.startsWith(date));
    } else if (date_from || date_to) {
        filteredActions = allActions.filter(a => {
            if (!a.created_at) return false;
            const d = a.created_at.slice(0, 10);
            if (date_from && d < date_from) return false;
            if (date_to && d > date_to) return false;
            return true;
        });
    }

    // Overall stats
    const totalLeads = allLeads.length;
    const statusCounts = {};
    allLeads.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
    const totalByStatus = Object.entries(statusCounts).map(([status, c]) => ({ status, c }));

    // Region stats — FULL ACTION BREAKDOWN
    const regionMap = {};
    allLeads.forEach(l => {
        const r = l.region || 'Без региона';
        if (!regionMap[r]) regionMap[r] = { total: 0, passed: 0, no_answer: 0, skipped: 0, callback: 0, docs: 0, other_person: 0 };
        regionMap[r].total++;
    });
    // Count actions per region
    filteredActions.forEach(a => {
        const lead = allLeads.find(l => l.id === a.lead_id);
        if (!lead) return;
        const r = lead.region || 'Без региона';
        if (!regionMap[r]) regionMap[r] = { total: 0, passed: 0, no_answer: 0, skipped: 0, callback: 0, docs: 0, other_person: 0 };
        const actionToKey = { 'передал': 'passed', 'не_дозвон': 'no_answer', 'скип_приветствие': 'skipped', 'перезвон': 'callback', 'срез_на_доках': 'docs', 'другой_человек': 'other_person' };
        const key = actionToKey[a.action_type];
        if (key && regionMap[r][key] !== undefined) regionMap[r][key]++;
    });
    const regionStats = Object.entries(regionMap).map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total);
    // Also keep simple counts for backward compat
    const regionCounts = {};
    allLeads.forEach(l => { const r = l.region || 'Без региона'; regionCounts[r] = (regionCounts[r] || 0) + 1; });

    // Per-user all-time stats
    const users = allUsers.map(u => {
        const created = db.count('leads', l => l.created_by === u.id);
        const userActions = filteredActions.filter(a => a.user_id === u.id);
        const actionMap = {};
        userActions.forEach(a => { actionMap[a.action_type] = (actionMap[a.action_type] || 0) + 1; });
        return { user_id: u.id, display_name: u.display_name, role: u.role, created, ...actionMap };
    });

    // Daily breakdown (last 14 days)
    const days = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayActions = allActions.filter(a => a.created_at && a.created_at.startsWith(dateStr));
        const dayLeads = allLeads.filter(l => l.created_at && l.created_at.startsWith(dateStr));

        const workers = allUsers.map(u => {
            const ua = dayActions.filter(a => a.user_id === u.id);
            const created = dayLeads.filter(l => l.created_by === u.id).length;
            return {
                display_name: u.display_name, created, total_actions: ua.length,
                'передал': ua.filter(a => a.action_type === 'передал').length,
                'не_дозвон': ua.filter(a => a.action_type === 'не_дозвон').length,
                'скип_приветствие': ua.filter(a => a.action_type === 'скип_приветствие').length,
                'перезвон': ua.filter(a => a.action_type === 'перезвон').length,
                'срез_на_доках': ua.filter(a => a.action_type === 'срез_на_доках').length
            };
        }).filter(w => w.total_actions > 0 || w.created > 0);

        days.push({
            date: dateStr, total_actions: dayActions.length, created: dayLeads.length,
            'передал': dayActions.filter(a => a.action_type === 'передал').length,
            'не_дозвон': dayActions.filter(a => a.action_type === 'не_дозвон').length,
            'скип_приветствие': dayActions.filter(a => a.action_type === 'скип_приветствие').length,
            'перезвон': dayActions.filter(a => a.action_type === 'перезвон').length,
            'срез_на_доках': dayActions.filter(a => a.action_type === 'срез_на_доках').length,
            workers
        });
    }

    res.json({ users, totalLeads, totalByStatus, regionCounts, regionStats, days });
});

// Admin leads by category + region filter
app.get('/api/admin/leads', requireAdmin, (req, res) => {
    const { status, region } = req.query;

    let leads = db.findAll('leads');
    if (status) leads = leads.filter(l => l.status === status);
    if (region) leads = leads.filter(l => l.region === region);

    leads = leads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 500);

    const result = leads.map(l => {
        const creator = db.findOne('users', u => u.id === l.created_by);
        const assigned = db.findOne('users', u => u.id === l.assigned_to);
        const actions = db.findAll('lead_actions', a => a.lead_id === l.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(a => {
                const user = db.findOne('users', u => u.id === a.user_id);
                return { ...a, user_name: user ? user.display_name : '—' };
            });
        try { l.relatives_parsed = JSON.parse(l.relatives || '[]'); } catch (e) { l.relatives_parsed = []; }
        return { ...l, creator_name: creator ? creator.display_name : '—', assigned_name: assigned ? assigned.display_name : '—', actions };
    });

    res.json(result);
});

// Admin: get all regions used
app.get('/api/admin/regions', requireAdmin, (req, res) => {
    const leads = db.findAll('leads');
    const regions = [...new Set(leads.map(l => l.region).filter(Boolean))];
    res.json(regions);
});

// Script (legacy)
app.post('/api/admin/script', requireAdmin, (req, res) => {
    db.setSetting('script', req.body.script || '');
    res.json({ ok: true });
});
app.get('/api/admin/script', requireAuth, (req, res) => {
    res.json({ script: db.getSetting('script') || '' });
});

// ============ JSON LEAD IMPORT ============
app.post('/api/admin/import-json', requireAdmin, (req, res) => {
    const { leads } = req.body;
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ error: 'Массив лидов пуст или отсутствует' });
    }

    let imported = 0, duplicates = 0;

    for (const lead of leads) {
        const deceasedName = (lead.deceased_name || '').trim();
        if (!deceasedName) continue;

        // Duplicate check by name OR phone
        const phonesClean = (lead.phones || '').replace(/[^0-9]/g, '');
        const existing = db.findOne('leads', l => {
            if (l.deceased_name && l.deceased_name.toLowerCase().trim() === deceasedName.toLowerCase()) return true;
            if (phonesClean && l.phones && l.phones.replace(/[^0-9]/g, '') === phonesClean) return true;
            return false;
        });
        if (existing) { duplicates++; continue; }

        // Build relatives JSON
        let relatives = '[]';
        if (Array.isArray(lead.relatives)) {
            relatives = JSON.stringify(lead.relatives.map(r => ({
                name: r.name || '',
                relationship: r.relationship || '',
                phone: r.phone || '',
                address: r.address || ''
            })));
        }

        db.insert('leads', {
            deceased_name: deceasedName,
            relatives,
            phones: lead.phones || '',
            address: lead.address || '',
            extra_info: lead.extra_info || '',
            region: lead.region || '',
            created_by: req.session.userId,
            status: 'new',
            assigned_to: null,
            source: 'json_import',
            base_id: null,
            created_at: new Date().toISOString()
        });
        imported++;
    }

    console.log(`JSON Import: ${imported} imported, ${duplicates} duplicates skipped`);
    res.json({ imported, duplicates });
});

// ============ DOCUMENTS (Info & Speeches) ============
const uploadDocs = multer({ dest: uploadsDir });

app.post('/api/documents', requireAuth, uploadDocs.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const origName = req.file.originalname;
    const storedName = Date.now() + '_' + origName.replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]/g, '_');
    const destPath = path.join(filesDir, storedName);
    fs.renameSync(req.file.path, destPath);

    const result = db.insert('documents', {
        original_name: origName,
        stored_name: storedName,
        description: req.body.description || '',
        uploaded_by: req.session.userId,
        size: req.file.size,
        created_at: new Date().toISOString()
    });
    res.json({ id: result.lastInsertRowid });
});

app.get('/api/documents', requireAuth, (req, res) => {
    const docs = db.findAll('documents').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const result = docs.map(d => {
        const user = db.findOne('users', u => u.id === d.uploaded_by);
        return { ...d, uploader_name: user ? user.display_name : '—' };
    });
    res.json(result);
});

app.get('/api/documents/:id/download', requireAuth, (req, res) => {
    const doc = db.findOne('documents', d => d.id === parseInt(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Файл не найден' });
    const filePath = path.join(filesDir, doc.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл удалён с диска' });
    res.download(filePath, doc.original_name);
});

app.delete('/api/documents/:id', requireAdmin, (req, res) => {
    const doc = db.findOne('documents', d => d.id === parseInt(req.params.id));
    if (doc) {
        const filePath = path.join(filesDir, doc.stored_name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        db.delete('documents', d => d.id === doc.id);
    }
    res.json({ ok: true });
});

// ============ ADMIN EXPORT CSV ============
app.get('/api/admin/export', requireAdmin, (req, res) => {
    const { status, region, date_from, date_to } = req.query;

    let leads = db.findAll('leads');
    if (status) leads = leads.filter(l => l.status === status);
    if (region) leads = leads.filter(l => l.region === region);
    if (date_from) leads = leads.filter(l => l.created_at && l.created_at.slice(0,10) >= date_from);
    if (date_to) leads = leads.filter(l => l.created_at && l.created_at.slice(0,10) <= date_to);

    leads = leads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Build CSV
    const statusNames = { new: 'Новый', no_answer: 'Не дозвон', callback: 'Перезвон', passed: 'Передал', docs: 'Срез на доках', skipped: 'Скип' };
    const bom = '\uFEFF';
    let csv = bom + 'ФИО умершего;Родственники;Телефоны;Адрес;Регион;Статус;Создал;Доп.инфо;Дата\n';

    leads.forEach(l => {
        const creator = db.findOne('users', u => u.id === l.created_by);
        let relatives = [];
        try { relatives = JSON.parse(l.relatives || '[]'); } catch (e) { }
        const relStr = relatives.map(r => `${r.name || ''} (${r.relationship || ''})`).join(', ');

        const row = [
            (l.deceased_name || '').replace(/;/g, ','),
            relStr.replace(/;/g, ','),
            (l.phones || '').replace(/;/g, ','),
            (l.address || '').replace(/;/g, ','),
            (l.region || '').replace(/;/g, ','),
            statusNames[l.status] || l.status || '',
            creator ? creator.display_name : '',
            (l.extra_info || '').replace(/;/g, ',').replace(/\n/g, ' '),
            l.created_at || ''
        ];
        csv += row.join(';') + '\n';
    });

    const fname = `export_${status || 'all'}_${region || 'all'}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
    res.send(csv);
});

// ============ ADMIN EXPORT + DELETE CSV ============
app.get('/api/admin/export-delete', requireAdmin, (req, res) => {
    const { status, region, date_from, date_to } = req.query;

    if (!status) return res.status(400).json({ error: 'Укажите статус для выгрузки' });

    let leads = db.findAll('leads');
    if (status) leads = leads.filter(l => l.status === status);
    if (region) leads = leads.filter(l => l.region === region);
    if (date_from) leads = leads.filter(l => l.created_at && l.created_at.slice(0,10) >= date_from);
    if (date_to) leads = leads.filter(l => l.created_at && l.created_at.slice(0,10) <= date_to);

    leads = leads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Build CSV
    const statusNames = { new: 'Новый', no_answer: 'Не дозвон', callback: 'Перезвон', passed: 'Передал', docs: 'Срез на доках', skipped: 'Скип' };
    const bom = '\uFEFF';
    let csv = bom + 'ФИО умершего;Родственники;Телефоны;Адрес;Регион;Статус;Создал;Доп.инфо;Дата\n';

    const leadIds = leads.map(l => l.id);

    leads.forEach(l => {
        const creator = db.findOne('users', u => u.id === l.created_by);
        let relatives = [];
        try { relatives = JSON.parse(l.relatives || '[]'); } catch (e) { }
        const relStr = relatives.map(r => `${r.name || ''} (${r.relationship || ''})`).join(', ');

        const row = [
            (l.deceased_name || '').replace(/;/g, ','),
            relStr.replace(/;/g, ','),
            (l.phones || '').replace(/;/g, ','),
            (l.address || '').replace(/;/g, ','),
            (l.region || '').replace(/;/g, ','),
            statusNames[l.status] || l.status || '',
            creator ? creator.display_name : '',
            (l.extra_info || '').replace(/;/g, ',').replace(/\n/g, ' '),
            l.created_at || ''
        ];
        csv += row.join(';') + '\n';
    });

    // DELETE the exported leads and their actions/callbacks
    leadIds.forEach(id => {
        db.delete('lead_actions', a => a.lead_id === id);
        db.delete('callbacks', c => c.lead_id === id);
    });
    db.delete('leads', l => leadIds.includes(l.id));

    console.log(`Export+Delete: ${leadIds.length} leads with status "${status}" exported and deleted`);

    const fname = `export_delete_${status || 'all'}_${region || 'all'}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
    res.send(csv);
});

// Export manual leads (no base) as JSON
app.get('/api/admin/leads/export-manual', requireAdmin, (req, res) => {
    const manualLeads = db.findAll('leads', l => !l.base_id || l.base_id === null);
    const exportData = manualLeads.map(l => {
        let relatives = [];
        try { relatives = JSON.parse(l.relatives || '[]'); } catch (e) {}
        return {
            deceased_name: l.deceased_name || '',
            relatives,
            phones: l.phones || '',
            address: l.address || '',
            extra_info: l.extra_info || '',
            region: l.region || '',
            status: l.status || 'new',
            source: l.source || 'manual'
        };
    });

    const fname = `manual_leads_${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
    res.send(JSON.stringify(exportData, null, 2));
});

// ============ HIMERA API SETTINGS ============
app.get('/api/admin/himera-settings', requireAdmin, (req, res) => {
    res.json({
        username: db.getSetting('himera_username') || '',
        password: db.getSetting('himera_password') || '',
        base_url: db.getSetting('himera_base_url') || 'https://himera-search.biz'
    });
});

app.post('/api/admin/himera-settings', requireAdmin, (req, res) => {
    const { username, password, base_url } = req.body;
    if (username !== undefined) db.setSetting('himera_username', username);
    if (password !== undefined) db.setSetting('himera_password', password);
    if (base_url !== undefined) db.setSetting('himera_base_url', base_url);
    // Clear cached token when credentials change
    himeraTokenCache = { token: null, expiresAt: null };
    res.json({ ok: true });
});

// ============ HIMERA API PROXY — ПРОБИВ ============
let himeraTokenCache = { token: null, expiresAt: null };

async function getHimeraToken(baseUrl, username, password) {
    // Return cached token if still valid (with 60s buffer)
    if (himeraTokenCache.token && himeraTokenCache.expiresAt) {
        const now = new Date();
        const expires = new Date(himeraTokenCache.expiresAt);
        if (now < new Date(expires.getTime() - 60000)) {
            return himeraTokenCache.token;
        }
    }

    // Login to get new token
    const loginResult = await himeraHttpRequest(baseUrl, null, '/api/v1/rest/auth/login', {
        username, password
    });

    if (loginResult.status === 200 && loginResult.data && loginResult.data.token) {
        himeraTokenCache.token = loginResult.data.token;
        himeraTokenCache.expiresAt = loginResult.data.expires_at;
        console.log('Himera: got new token, expires at', loginResult.data.expires_at);
        return himeraTokenCache.token;
    }

    throw new Error('Ошибка авторизации Himera: ' + JSON.stringify(loginResult.data));
}

function himeraHttpRequest(baseUrl, token, endpoint, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, baseUrl);
        const https = require('https');
        const http = require('http');
        const mod = url.protocol === 'https:' ? https : http;

        const postData = JSON.stringify(body);
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        };
        if (token) {
            headers['Authorization'] = token;
        }

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers,
            rejectUnauthorized: false
        };

        const req = mod.request(options, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    resolve({ status: response.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: response.statusCode, data: data });
                }
            });
        });
        req.on('error', e => reject(e));
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(postData);
        req.end();
    });
}

async function himeraRequest(baseUrl, username, password, endpoint, body) {
    const token = await getHimeraToken(baseUrl, username, password);
    const result = await himeraHttpRequest(baseUrl, token, endpoint, body);
    // If 401, token may have expired — re-login and retry once
    if (result.status === 401) {
        himeraTokenCache = { token: null, expiresAt: null };
        const newToken = await getHimeraToken(baseUrl, username, password);
        return await himeraHttpRequest(baseUrl, newToken, endpoint, body);
    }
    return result;
}

// Определение родственных связей по фамилии/отчеству
function detectRelationship(targetPerson, foundPerson) {
    const tParts = (targetPerson.fullName || '').trim().split(/\s+/);
    const fParts = (foundPerson.fullName || foundPerson.name || '').trim().split(/\s+/);

    const tLastname = (tParts[0] || '').toLowerCase();
    const tFirstname = (tParts[1] || '').toLowerCase();
    const tMiddlename = (tParts[2] || '').toLowerCase();

    const fLastname = (fParts[0] || '').toLowerCase();
    const fFirstname = (fParts[1] || '').toLowerCase();
    const fMiddlename = (fParts[2] || '').toLowerCase();

    if (!tLastname || !fLastname) return 'Сожитель';

    // Same person check
    if (tLastname === fLastname && tFirstname === fFirstname && tMiddlename === fMiddlename) {
        return 'Сам';
    }

    const sameSurname = tLastname === fLastname ||
        tLastname === fLastname.replace(/а$/, '') ||
        tLastname.replace(/а$/, '') === fLastname ||
        tLastname + 'а' === fLastname ||
        fLastname + 'а' === tLastname;

    // Female surname variant check (Иванов/Иванова)
    const sameFamily = sameSurname ||
        tLastname === fLastname.replace(/ая$/, 'ой').replace(/ая$/, 'ий') ||
        fLastname === tLastname.replace(/ая$/, 'ой').replace(/ая$/, 'ий');

    const samePatronymic = tMiddlename && fMiddlename && tMiddlename === fMiddlename;
    const femalePatronymic = fMiddlename.endsWith('на') || fMiddlename.endsWith('вна');
    const malePatronymic = fMiddlename.endsWith('ич') || fMiddlename.endsWith('вич');

    // Derive father's name from patronymic  
    const tFatherName = tMiddlename.replace(/ович$|евич$|ич$|овна$|евна$|на$/, '');
    const fFatherName = fMiddlename.replace(/ович$|евич$|ич$|овна$|евна$|на$/, '');
    const samePatrBase = tFatherName && fFatherName && tFatherName === fFatherName;

    if (sameFamily) {
        // Same patronymic = siblings
        if (samePatrBase && tFirstname !== fFirstname) {
            return femalePatronymic ? 'Сестра' : 'Брат';
        }
        // Person's first name matches patronymic root = parent
        if (fMiddlename && tFirstname === fFatherName) {
            return femalePatronymic ? 'Дочь' : 'Сын';
        }
        if (tMiddlename && fFirstname === tFatherName) {
            return malePatronymic ? 'Отец' : 'Мать';
        }
        // Same surname, different patronymic
        if (tMiddlename && fMiddlename && !samePatrBase) {
            return femalePatronymic ? 'Жена' : 'Муж';
        }
        return 'Родственник';
    }

    // Different surname at same address
    if (tMiddlename && fMiddlename && samePatrBase) {
        return femalePatronymic ? 'Сестра (по отцу)' : 'Брат (по отцу)';
    }

    return 'Сожитель';
}

app.post('/api/admin/probiv', requireAdmin, async (req, res) => {
    const { lastname, firstname, middlename, birthday } = req.body;

    if (!lastname || !firstname || !birthday) {
        return res.status(400).json({ error: 'Введите фамилию, имя и дату рождения' });
    }

    const himeraUsername = db.getSetting('himera_username');
    const himeraPassword = db.getSetting('himera_password');
    const baseUrl = db.getSetting('himera_base_url') || 'https://himera-search.biz';

    if (!himeraUsername || !himeraPassword) {
        return res.status(400).json({ error: 'Логин/пароль Himera не настроены. Заполните в настройках.' });
    }

    const fullName = `${lastname} ${firstname} ${middlename || ''}`.trim();
    const result = {
        target: { fullName, lastname, firstname, middlename, birthday },
        phones: [],
        addresses: [],
        addressPeople: [],
        relatives: [],
        steps: []
    };

    try {
        // STEP 1: Get phones
        result.steps.push({ step: 1, name: 'Получение телефонов', status: 'loading' });
        try {
            const phonesRes = await himeraRequest(baseUrl, himeraUsername, himeraPassword, '/api/v1/rest/closed-data/getPhonesByFioDob', {
                lastname, firstname, middlename: middlename || '', birthday
            });
            if (phonesRes.status === 200 && phonesRes.data) {
                result.phones = Array.isArray(phonesRes.data) ? phonesRes.data :
                    (phonesRes.data.phones || phonesRes.data.result || []);
            }
            result.steps[0].status = 'done';
            result.steps[0].count = result.phones.length;
        } catch (e) {
            result.steps[0].status = 'error';
            result.steps[0].error = e.message;
        }

        // STEP 2: Get addresses
        result.steps.push({ step: 2, name: 'Получение адресов', status: 'loading' });
        try {
            const addrRes = await himeraRequest(baseUrl, himeraUsername, himeraPassword, '/api/v1/rest/closed-data/getAddressesByFioDob', {
                lastname, firstname, middlename: middlename || '', birthday
            });
            if (addrRes.status === 200 && addrRes.data) {
                const rawAddrs = Array.isArray(addrRes.data) ? addrRes.data :
                    (addrRes.data.addrs || addrRes.data.result || addrRes.data.addresses || []);
                result.addresses = rawAddrs.map(a => {
                    if (typeof a === 'string') return { full: a };
                    return { full: a.full || a.address || JSON.stringify(a), ...a };
                });
            }
            result.steps[1].status = 'done';
            result.steps[1].count = result.addresses.length;
        } catch (e) {
            result.steps[1].status = 'error';
            result.steps[1].error = e.message;
        }

        // STEP 3: For each address, get people
        result.steps.push({ step: 3, name: 'Пробив адресов — поиск людей', status: 'loading' });
        const allPeopleByAddress = [];
        for (const addr of result.addresses.slice(0, 5)) { // Limit to 5 addresses
            try {
                const infoRes = await himeraRequest(baseUrl, himeraUsername, himeraPassword, '/api/v1/rest/closed-data/getInfoByAddress', {
                    address: addr.full
                });
                if (infoRes.status === 200 && infoRes.data) {
                    const people = Array.isArray(infoRes.data) ? infoRes.data :
                        (infoRes.data.result || infoRes.data.persons || infoRes.data.people || []);
                    allPeopleByAddress.push({
                        address: addr.full,
                        people: people.map(p => {
                            if (typeof p === 'string') return { fullName: p, name: p };
                            return {
                                fullName: p.fullName || p.name || p.fio ||
                                    [p.lastname, p.firstname, p.middlename].filter(Boolean).join(' ') || 'Неизвестно',
                                birthday: p.birthday || p.dob || '',
                                phones: p.phones || [],
                                ...p
                            };
                        })
                    });
                }
            } catch (e) { /* skip failed address */ }
        }
        result.addressPeople = allPeopleByAddress;
        result.steps[2].status = 'done';
        result.steps[2].count = allPeopleByAddress.reduce((s, ap) => s + ap.people.length, 0);

        // STEP 4: Detect relatives
        result.steps.push({ step: 4, name: 'Определение родственников', status: 'loading' });
        const relatives = [];
        const seen = new Set();
        for (const ap of allPeopleByAddress) {
            for (const person of ap.people) {
                const key = (person.fullName || '').toLowerCase().trim();
                if (seen.has(key)) continue;
                seen.add(key);

                const relationship = detectRelationship(result.target, person);
                if (relationship !== 'Сам') {
                    relatives.push({
                        name: person.fullName || person.name,
                        relationship,
                        birthday: person.birthday || '',
                        phones: person.phones || [],
                        address: ap.address
                    });
                }
            }
        }
        result.relatives = relatives;
        result.steps[3].status = 'done';
        result.steps[3].count = relatives.length;

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: 'Ошибка пробива: ' + e.message, result });
    }
});

// Create lead from probiv results
app.post('/api/admin/probiv/create-lead', requireAdmin, (req, res) => {
    const { deceased_name, relatives, phones, address, region } = req.body;

    if (!deceased_name) {
        return res.status(400).json({ error: 'ФИО не указано' });
    }

    const existing = db.findOne('leads', l => l.deceased_name && l.deceased_name.toLowerCase().trim() === deceased_name.trim().toLowerCase());
    if (existing) {
        return res.status(409).json({ error: 'Лид с таким ФИО уже существует!' });
    }

    const result = db.insert('leads', {
        deceased_name: deceased_name.trim(),
        relatives: JSON.stringify(relatives || []),
        phones: phones || '',
        address: address || '',
        extra_info: 'Создан из пробива Himera',
        region: region || '',
        created_by: req.session.userId,
        status: 'new',
        assigned_to: null,
        source: 'probiv',
        base_id: null,
        created_at: new Date().toISOString()
    });

    res.json({ id: result.lastInsertRowid });
});

// ============ UNIFIED BASE MANAGEMENT ============
// all-bases endpoint moved to bottom (after income helpers) - see line ~3121


// ============ PASS RECORDS (Переданные трубки) ============

// Save a pass record (any authenticated user)
app.post('/api/pass-records', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { time_msk, manager, fio, phone, address, what_gave, sms_spam, who_nearby, scheme, extra_info, base_name, source, lead_id } = req.body;
    
    const record = db.insert('pass_records', {
        time_msk: time_msk || '',
        manager: manager || '',
        fio: fio || '',
        phone: phone || '',
        address: address || '',
        what_gave: what_gave || '',
        sms_spam: sms_spam || '',
        who_nearby: who_nearby || '',
        scheme: scheme || '',
        extra_info: extra_info || '',
        base_name: base_name || '',
        source: source || 'svo',
        lead_id: lead_id || null,
        worker_id: req.session.userId,
        worker_name: req.session.displayName || '',
        department_id: req.session.departmentId || null,
        created_at: new Date().toISOString()
    });
    res.json({ ok: true, id: record.lastInsertRowid });
});

// Admin: get pass records with filters
app.get('/api/admin/pass-records', requireAdmin, (req, res) => {
    const { date, dept_id } = req.query;
    let records = db.findAll('pass_records');
    
    // Filter by date
    if (date) {
        records = records.filter(r => r.created_at && r.created_at.startsWith(date));
    }
    // Filter by department
    if (dept_id) {
        records = records.filter(r => r.department_id === parseInt(dept_id));
    }
    
    // Sort newest first
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json(records);
});

// ============ DEPARTMENTS (ИНН отделы) ============
const XLSX = require('xlsx');

// --- Search dept leads by FIO across all departments ---
app.get('/api/admin/dept-leads/search-fio', requireAdmin, (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q || q.length < 2) return res.json([]);

    const allDeptLeads = db.findAll('dept_leads', l =>
        l.fio && l.fio.toLowerCase().includes(q)
    ).slice(0, 100);

    const result = allDeptLeads.map(l => {
        const base = l.base_id ? db.findOne('dept_bases', b => b.id === l.base_id) : null;
        const dept = db.findOne('departments', d => d.id === l.department_id);
        return {
            id: l.id,
            fio: l.fio || '',
            phone: l.phone || '',
            inn: l.inn || '',
            status: l.status || '',
            base_id: l.base_id,
            base_name: base ? base.name : '—',
            department_id: l.department_id,
            department_name: dept ? dept.name : '—'
        };
    });

    res.json(result);
});

// --- Department CRUD ---
app.get('/api/admin/departments', requireAdmin, (req, res) => {
    const depts = db.findAll('departments').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const result = depts.map(d => {
        const users = db.findAll('dept_users', u => u.department_id === d.id);
        const leads = db.findAll('dept_leads', l => l.department_id === d.id);
        const bases = db.findAll('dept_bases', b => b.department_id === d.id);
        const newLeads = leads.filter(l => l.status === 'new').length;
        return { ...d, user_count: users.length, lead_count: leads.length, base_count: bases.length, new_leads: newLeads };
    });
    res.json(result);
});

app.post('/api/admin/departments', requireAdmin, (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    const existing = db.findOne('departments', d => d.name === name);
    if (existing) return res.status(409).json({ error: 'Отдел уже существует' });
    const result = db.insert('departments', {
        name, description: description || '', created_by: req.session.userId, created_at: new Date().toISOString()
    });
    res.json({ id: result.lastInsertRowid });
});

app.put('/api/admin/departments/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const dept = db.findOne('departments', d => d.id === id);
    if (!dept) return res.status(404).json({ error: 'Отдел не найден' });
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    db.update('departments', d => d.id === id, updates);
    res.json({ ok: true });
});

app.delete('/api/admin/departments/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    db.delete('dept_lead_actions', a => a.department_id === id);
    db.delete('dept_leads', l => l.department_id === id);
    db.delete('dept_bases', b => b.department_id === id);
    db.delete('dept_users', u => u.department_id === id);
    db.delete('departments', d => d.id === id);
    res.json({ ok: true });
});

// --- Department Users ---
app.get('/api/admin/departments/:id/users', requireAdmin, (req, res) => {
    const deptId = parseInt(req.params.id);
    const users = db.findAll('dept_users', u => u.department_id === deptId).map(u => ({
        id: u.id, username: u.username, display_name: u.display_name, role: u.role, department_id: u.department_id, created_at: u.created_at
    }));
    res.json(users);
});

app.post('/api/admin/departments/:id/users', requireAdmin, (req, res) => {
    const deptId = parseInt(req.params.id);
    const dept = db.findOne('departments', d => d.id === deptId);
    if (!dept) return res.status(404).json({ error: 'Отдел не найден' });
    const { username, password, display_name, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
    const existingMain = db.findOne('users', u => u.username === username);
    const existingDept = db.findOne('dept_users', u => u.username === username);
    if (existingMain || existingDept) return res.status(409).json({ error: 'Логин уже занят' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.insert('dept_users', {
        department_id: deptId, username, password_hash: hash, display_name: display_name || username,
        role: role || 'dept_worker', created_at: new Date().toISOString()
    });
    res.json({ id: result.lastInsertRowid });
});

app.put('/api/admin/dept-users/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const user = db.findOne('dept_users', u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const updates = {};
    if (req.body.display_name) updates.display_name = req.body.display_name;
    if (req.body.password) updates.password_hash = bcrypt.hashSync(req.body.password, 10);
    if (req.body.role) updates.role = req.body.role;
    db.update('dept_users', u => u.id === id, updates);
    res.json({ ok: true });
});

app.delete('/api/admin/dept-users/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    db.delete('dept_users', u => u.id === id);
    res.json({ ok: true });
});

// --- Department Excel Import ---
app.post('/api/admin/departments/:id/import-excel', requireAdmin, upload.single('file'), (req, res) => {
    const deptId = parseInt(req.params.id);
    const dept = db.findOne('departments', d => d.id === deptId);
    if (!dept) return res.status(404).json({ error: 'Отдел не найден' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (data.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Файл пустой' });
        }

        // Auto-detect columns
        const headers = Object.keys(data[0]);
        const columnMap = {};
        const knownFields = [
            { keys: ['фио', 'фіо', 'имя', 'ім\'я', 'name', 'fullname', 'full_name', 'fio'], field: 'fio' },
            { keys: ['телефон', 'номер', 'phone', 'тел', 'номер телефона', 'tel'], field: 'phone' },
            { keys: ['регион', 'region', 'область', 'обл'], field: 'region' },
            { keys: ['город', 'city', 'місто'], field: 'city' },
            { keys: ['адрес', 'address', 'адреса'], field: 'address' },
            { keys: ['дата рождения', 'д.р.', 'др', 'birthday', 'дата_рождения', 'birth', 'дата народження'], field: 'birthday' },
            { keys: ['инн', ' inn', 'ідентифікаційний', 'инн код'], field: 'inn' },
            { keys: ['снилс', 'snils'], field: 'snils' },
            { keys: ['паспорт', 'passport', 'серия номер'], field: 'passport' },
            { keys: ['статус', 'status'], field: 'status' },
            { keys: ['доп', 'доп.', 'дополнительно', 'extra', 'примечание', 'комментарий', 'comment', 'доп. поле'], field: 'extra' },
            { keys: ['менеджер', 'manager', 'оператор'], field: 'manager' },
            { keys: ['id базы', 'id_базы', 'base_id', 'id бази'], field: 'base_id_col' },
        ];

        headers.forEach(h => {
            const hLow = h.toLowerCase().trim();
            let matched = false;
            for (const kf of knownFields) {
                if (kf.keys.some(k => hLow.includes(k))) {
                    columnMap[h] = kf.field;
                    matched = true;
                    break;
                }
            }
            if (!matched) columnMap[h] = 'extra';
        });

        // Return preview (first 5 rows) + columns for mapping
        const preview = data.slice(0, 10);
        fs.unlinkSync(req.file.path);

        res.json({
            columns: headers,
            column_map: columnMap,
            preview,
            total_rows: data.length,
            sheet_name: sheetName
        });
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(400).json({ error: 'Ошибка чтения файла: ' + e.message });
    }
});

// Confirm import after preview — auto-sort by company INN
app.post('/api/admin/departments/:id/confirm-import', requireAdmin, upload.single('file'), (req, res) => {
    const deptId = parseInt(req.params.id);
    const dept = db.findOne('departments', d => d.id === deptId);
    if (!dept) return res.status(404).json({ error: 'Отдел не найден' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    try {
        const columnMap = JSON.parse(req.body.column_map || '{}');
        const baseName = req.body.base_name || 'База ' + new Date().toLocaleDateString('ru-RU');
        const columns = JSON.parse(req.body.columns || '[]');
        const autoSort = req.body.auto_sort_inn === '1'; // new flag

        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        // Helper: extract company name + INN from extra fields
        function extractCompanyInn(extraFields) {
            const allVals = Object.values(extraFields).join(' ');
            // Pattern: "company name | INN_DIGITS" or "company name (type) | INN_DIGITS"
            const m = allVals.match(/([^,;]+?\s*(?:\([^)]*\))?\s*\|\s*(\d{10,12}))/);
            if (m) {
                const full = m[1].trim();
                const inn = m[2];
                const name = full.replace(/\s*\|\s*\d+$/, '').trim();
                return { companyName: name, companyInn: inn, label: name + ' | ' + inn };
            }
            return null;
        }

        // Build all leads first
        const allLeads = [];
        let duplicates = 0;
        for (const row of data) {
            const leadData = { department_id: deptId, status: 'new', assigned_to: null };
            const extraFields = {};
            for (const [header, field] of Object.entries(columnMap)) {
                const val = String(row[header] || '').trim();
                if (field === 'fio') leadData.fio = val;
                else if (field === 'phone') leadData.phone = val;
                else if (field === 'region') leadData.region = val;
                else if (field === 'city') leadData.city = val;
                else if (field === 'address') leadData.address = val;
                else if (field === 'birthday') leadData.birthday = val;
                else if (field === 'inn') leadData.inn = val;
                else if (field === 'snils') leadData.snils = val;
                else if (field === 'passport') leadData.passport = val;
                else if (field === 'extra') { if (val) extraFields[header] = val; }
                else if (field === 'manager') leadData.manager = val;
                else if (field === 'skip') { /* skip column */ }
                else { if (val) extraFields[header] = val; }
            }

            if (!leadData.fio && !leadData.phone) continue;

            // Duplicate check by FIO or phone within department
            const deptPhoneClean = (leadData.phone || '').replace(/[^0-9]/g, '');
            const existingDept = db.findOne('dept_leads', l => {
                if (l.department_id !== deptId) return false;
                if (leadData.fio && l.fio && l.fio.toLowerCase().trim() === leadData.fio.toLowerCase().trim()) return true;
                if (deptPhoneClean && l.phone && l.phone.replace(/[^0-9]/g, '') === deptPhoneClean) return true;
                return false;
            });
            if (existingDept) { duplicates++; continue; }

            leadData.extra = JSON.stringify(extraFields);
            leadData.extra_data = leadData.extra; // some code uses extra_data
            leadData.created_at = new Date().toISOString();
            leadData.created_by = req.session.userId;

            // Extract company INN for sorting
            const company = autoSort ? extractCompanyInn(extraFields) : null;
            leadData._companyKey = company ? company.label : null;
            allLeads.push(leadData);
        }

        let imported = 0;
        const basesCreated = [];

        if (autoSort) {
            // Group leads by company INN
            const groups = {};
            for (const lead of allLeads) {
                const key = lead._companyKey || '__no_company__';
                if (!groups[key]) groups[key] = [];
                groups[key].push(lead);
            }

            // Create a base for each company
            for (const [key, leads] of Object.entries(groups)) {
                const bName = key === '__no_company__' ? baseName + ' (без компании)' : key;
                const baseResult = db.insert('dept_bases', {
                    department_id: deptId, name: bName, columns: JSON.stringify(columns),
                    column_map: JSON.stringify(columnMap), enabled: 1,
                    uploaded_by: req.session.userId, created_at: new Date().toISOString()
                });
                const bId = baseResult.lastInsertRowid;
                basesCreated.push({ id: bId, name: bName, count: leads.length });

                for (const lead of leads) {
                    delete lead._companyKey;
                    lead.base_id = bId;
                    db.insert('dept_leads', lead);
                    imported++;
                }
            }
        } else {
            // Original behavior: one base
            const baseResult = db.insert('dept_bases', {
                department_id: deptId, name: baseName, columns: JSON.stringify(columns),
                column_map: JSON.stringify(columnMap), enabled: 1,
                uploaded_by: req.session.userId, created_at: new Date().toISOString()
            });
            const baseId = baseResult.lastInsertRowid;
            basesCreated.push({ id: baseId, name: baseName, count: allLeads.length });

            for (const lead of allLeads) {
                delete lead._companyKey;
                lead.base_id = baseId;
                db.insert('dept_leads', lead);
                imported++;
            }
        }

        fs.unlinkSync(req.file.path);
        console.log(`Dept Excel Import: "${dept.name}" — ${imported} imported, ${duplicates} duplicates, ${basesCreated.length} bases`);
        res.json({ imported, duplicates, bases_created: basesCreated, base_count: basesCreated.length });
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(400).json({ error: 'Ошибка импорта: ' + e.message });
    }
});

// --- Department Leads ---
app.get('/api/admin/departments/:id/leads', requireAdmin, (req, res) => {
    const deptId = parseInt(req.params.id);
    const { status, base_id } = req.query;
    let leads = db.findAll('dept_leads', l => l.department_id === deptId);
    if (status) leads = leads.filter(l => l.status === status);
    if (base_id) leads = leads.filter(l => l.base_id === parseInt(base_id));
    leads = leads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 500);
    const result = leads.map(l => {
        const assigned = l.assigned_to ? db.findOne('dept_users', u => u.id === l.assigned_to) : null;
        const actions = db.findAll('dept_lead_actions', a => a.lead_id === l.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return { ...l, assigned_name: assigned ? assigned.display_name : '—', actions };
    });
    res.json(result);
});

app.delete('/api/admin/dept-leads/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    db.delete('dept_lead_actions', a => a.lead_id === id);
    db.delete('dept_leads', l => l.id === id);
    res.json({ ok: true });
});

// Update dept lead fields
app.put('/api/admin/dept-leads/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const lead = db.findOne('dept_leads', l => l.id === id);
    if (!lead) return res.status(404).json({ error: 'Лид не найден' });
    const allowed = ['fio','phone','region','city','address','birthday','inn','snils','passport','status','extra','manager'];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    db.update('dept_leads', l => l.id === id, updates);
    res.json({ ok: true });
});

// --- Department Bases ---
// Single base detail with leads (supports ?sub_status= filter)
app.get('/api/admin/dept-bases/:id/detail', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    let leads = db.findAll('dept_leads', l => l.base_id === id);
    // Optional: filter by sub-status
    const subStatus = req.query.sub_status;
    if (subStatus) leads = leads.filter(l => l.status === subStatus);
    // Enrich leads with assigned worker names
    const enrichedLeads = leads.map(l => {
        const assigned = l.assigned_to ? db.findOne('dept_users', u => u.id === l.assigned_to) : null;
        return { ...l, assigned_name: assigned ? assigned.display_name : '—' };
    });
    // Always include full status breakdown
    const allLeads = db.findAll('dept_leads', l => l.base_id === id);
    const statusBreakdown = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0, talked: 0, other_person: 0, inn_called: 0 };
    allLeads.forEach(l => { if (statusBreakdown[l.status] !== undefined) statusBreakdown[l.status]++; });
    res.json({ ...base, leads: enrichedLeads, statusBreakdown, total_leads: allLeads.length });
});

app.get('/api/admin/departments/:id/bases', requireAdmin, (req, res) => {
    const deptId = parseInt(req.params.id);
    const bases = db.findAll('dept_bases', b => b.department_id === deptId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const result = bases.map(b => {
        const leads = db.findAll('dept_leads', l => l.base_id === b.id);
        const stats = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0, talked: 0, other_person: 0, inn_called: 0 };
        leads.forEach(l => { if (stats[l.status] !== undefined) stats[l.status]++; });
        return { ...b, lead_count: leads.length, stats };
    });
    res.json(result);
});

app.delete('/api/admin/dept-bases/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    db.delete('dept_lead_actions', a => {
        const lead = db.findOne('dept_leads', l => l.id === a.lead_id);
        return lead && lead.base_id === id;
    });
    db.delete('dept_leads', l => l.base_id === id);
    db.delete('dept_bases', b => b.id === id);
    res.json({ ok: true });
});

app.post('/api/admin/dept-bases/:id/toggle', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    db.update('dept_bases', b => b.id === id, { enabled: base.enabled ? 0 : 1 });
    res.json({ ok: true });
});

// Rename dept base
app.put('/api/admin/dept-bases/:id/rename', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Имя не может быть пустым' });
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    db.update('dept_bases', b => b.id === id, { name: name.trim() });
    res.json({ ok: true });
});

// Save field settings for a base (column visibility, names, order)
app.put('/api/admin/dept-bases/:id/settings', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const { field_settings } = req.body;
    if (!field_settings) return res.status(400).json({ error: 'field_settings обязателен' });
    db.update('dept_bases', b => b.id === id, { field_settings: JSON.stringify(field_settings) });
    res.json({ ok: true });
});

// Save VIP distribution config for a base
app.put('/api/admin/dept-bases/:id/vip-config', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const { vip_config } = req.body;
    db.update('dept_bases', b => b.id === id, { vip_config: JSON.stringify(vip_config || {}) });
    res.json({ ok: true });
});

// Assign workers to a base (empty array = all workers)
app.put('/api/admin/dept-bases/:id/assign-workers', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const { worker_ids } = req.body; // array of user IDs, empty = all
    db.update('dept_bases', b => b.id === id, { assigned_workers: JSON.stringify(worker_ids || []) });
    res.json({ ok: true });
});

// Get assigned workers for a base
app.get('/api/admin/dept-bases/:id/assigned-workers', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    let workers = [];
    try { workers = JSON.parse(base.assigned_workers || '[]'); } catch(e) {}
    res.json({ worker_ids: workers });
});

// Return leads of a specific status back to 'new' for re-calling
app.post('/api/admin/dept-bases/:id/return-leads', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Укажите статус' });
    const leads = db.findAll('dept_leads', l => l.base_id === id && l.status === status);
    let count = 0;
    leads.forEach(l => {
        db.update('dept_leads', lead => lead.id === l.id, { status: 'new', assigned_to: null, assigned_at: null });
        count++;
    });
    console.log(`Return leads: base ${id}, status ${status} → ${count} leads returned to new`);
    res.json({ ok: true, returned: count });
});

// Detailed base statistics
app.get('/api/admin/dept-bases/:id/stats', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const leads = db.findAll('dept_leads', l => l.base_id === id);
    const actions = db.findAll('dept_lead_actions', a => {
        const lead = db.findOne('dept_leads', l => l.id === a.lead_id);
        return lead && lead.base_id === id;
    });
    // Status breakdown
    const statusBreakdown = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0, talked: 0, other_person: 0, inn_called: 0 };
    leads.forEach(l => { if (statusBreakdown[l.status] !== undefined) statusBreakdown[l.status]++; });
    // Daily activity (last 14 days)
    const dailyActivity = {};
    for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        dailyActivity[d.toISOString().slice(0, 10)] = 0;
    }
    actions.forEach(a => {
        const day = (a.created_at || '').slice(0, 10);
        if (dailyActivity[day] !== undefined) dailyActivity[day]++;
    });
    // Per-worker stats
    const workerMap = {};
    actions.forEach(a => {
        if (!workerMap[a.user_id]) {
            const u = db.findOne('dept_users', u => u.id === a.user_id);
            workerMap[a.user_id] = { user_id: a.user_id, name: u ? u.display_name : '?', total: 0, actions: {} };
        }
        workerMap[a.user_id].total++;
        workerMap[a.user_id].actions[a.action_type] = (workerMap[a.user_id].actions[a.action_type] || 0) + 1;
    });
    const workers = Object.values(workerMap).sort((a, b) => b.total - a.total);
    const processed = leads.length - statusBreakdown.new;
    res.json({
        total: leads.length, processed, remaining: statusBreakdown.new,
        progress: leads.length ? Math.round((processed / leads.length) * 100) : 0,
        statusBreakdown, dailyActivity, workers, total_actions: actions.length
    });
});

// --- Department Stats ---
app.get('/api/admin/departments/:id/stats', requireAdmin, (req, res) => {
    const deptId = parseInt(req.params.id);
    const leads = db.findAll('dept_leads', l => l.department_id === deptId);
    const actions = db.findAll('dept_lead_actions', a => a.department_id === deptId);
    const users = db.findAll('dept_users', u => u.department_id === deptId);
    const today = new Date().toISOString().slice(0, 10);

    const statusCounts = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0 };
    leads.forEach(l => { if (statusCounts[l.status] !== undefined) statusCounts[l.status]++; });

    const todayActions = actions.filter(a => a.created_at && a.created_at.startsWith(today));
    const workerStats = users.map(u => {
        const ua = todayActions.filter(a => a.user_id === u.id);
        return {
            user_id: u.id, display_name: u.display_name, total: ua.length,
            'не_дозвон': ua.filter(a => a.action_type === 'не_дозвон').length,
            'перезвон': ua.filter(a => a.action_type === 'перезвон').length,
            'передал': ua.filter(a => a.action_type === 'передал').length,
            'срез_на_доках': ua.filter(a => a.action_type === 'срез_на_доках').length,
        };
    }).sort((a, b) => b.total - a.total);

    res.json({
        total_leads: leads.length, statusCounts, total_actions: actions.length,
        today_actions: todayActions.length, workers: workerStats, user_count: users.length
    });
});

// --- Global Stats (ALL departments: СВО + ИНН) with date range ---
app.get('/api/admin/dept-global-stats', requireAdmin, (req, res) => {
    const { date_from, date_to } = req.query;
    const today = new Date().toISOString().slice(0, 10);

    // Date filter helper
    function inRange(dateStr) {
        if (!dateStr) return false;
        const d = dateStr.slice(0, 10);
        if (date_from && d < date_from) return false;
        if (date_to && d > date_to) return false;
        return true;
    }
    const hasDateFilter = !!(date_from || date_to);

    // ===== GATHER ALL ACTIONS (unified) =====
    // СВО actions (lead_actions -> users)
    const svoUsers = db.findAll('users', u => u.role === 'worker');
    const svoLeads = db.findAll('leads');
    let svoActions = db.findAll('lead_actions');
    if (hasDateFilter) svoActions = svoActions.filter(a => inRange(a.created_at));

    // ИНН actions (dept_lead_actions -> dept_users)
    const depts = db.findAll('departments');
    const allDeptUsers = db.findAll('dept_users');
    const allDeptLeads = db.findAll('dept_leads');
    let allDeptActions = db.findAll('dept_lead_actions');
    if (hasDateFilter) allDeptActions = allDeptActions.filter(a => inRange(a.created_at));

    // Combine into unified actions list
    const unifiedActions = [];
    svoActions.forEach(a => {
        unifiedActions.push({ ...a, _source: 'svo', _dept: 'СВО' });
    });
    allDeptActions.forEach(a => {
        const dept = depts.find(d => d.id === a.department_id);
        unifiedActions.push({ ...a, _source: 'inn', _dept: dept ? dept.name : 'ИНН' });
    });

    // Global totals
    const totalActions = unifiedActions.length;
    const globalActionTypes = {};
    unifiedActions.forEach(a => { globalActionTypes[a.action_type] = (globalActionTypes[a.action_type] || 0) + 1; });

    const totalNoAnswer = globalActionTypes['не_дозвон'] || 0;
    const globalDialRate = totalActions > 0 ? Math.round(((totalActions - totalNoAnswer) / totalActions) * 100) : 0;

    // Today totals
    const todayUnified = unifiedActions.filter(a => a.created_at && a.created_at.startsWith(today));
    const todayCalls = todayUnified.length;
    const todayActionTypes = {};
    todayUnified.forEach(a => { todayActionTypes[a.action_type] = (todayActionTypes[a.action_type] || 0) + 1; });
    const todayDialRate = todayCalls > 0 ? Math.round(((todayCalls - (todayActionTypes['не_дозвон']||0)) / todayCalls) * 100) : 0;

    // ===== BUILD GROUPS (СВО + each ИНН dept) =====
    const groups = [];

    // --- СВО Group ---
    const svoWorkerMap = {};
    svoActions.forEach(a => {
        const key = 'svo_' + a.user_id;
        if (!svoWorkerMap[key]) {
            const u = svoUsers.find(u => u.id === a.user_id) || db.findOne('users', u => u.id === a.user_id);
            svoWorkerMap[key] = { user_id: a.user_id, name: u ? u.display_name : '?', total: 0, today: 0, actions: {}, todayActions: {} };
        }
        svoWorkerMap[key].total++;
        svoWorkerMap[key].actions[a.action_type] = (svoWorkerMap[key].actions[a.action_type] || 0) + 1;
        if (a.created_at && a.created_at.startsWith(today)) {
            svoWorkerMap[key].today++;
            svoWorkerMap[key].todayActions[a.action_type] = (svoWorkerMap[key].todayActions[a.action_type] || 0) + 1;
        }
    });
    const svoWorkers = Object.values(svoWorkerMap).map(w => {
        const noAns = w.actions['не_дозвон'] || 0;
        return {
            ...w,
            'не_дозвон': noAns,
            'перезвон': w.actions['перезвон'] || 0,
            'передал': w.actions['передал'] || 0,
            'срез_на_доках': w.actions['срез_на_доках'] || 0,
            'скип_приветствие': w.actions['скип_приветствие'] || 0,
            'другой_человек': w.actions['другой_человек'] || 0,
            dialRate: w.total > 0 ? Math.round(((w.total - noAns) / w.total) * 100) : 0,
            today_total: w.today,
            todayDialRate: w.today > 0 ? Math.round(((w.today - (w.todayActions['не_дозвон']||0)) / w.today) * 100) : 0
        };
    }).filter(w => w.total > 0).sort((a, b) => b.total - a.total);

    const svoActionTypes = {};
    svoActions.forEach(a => { svoActionTypes[a.action_type] = (svoActionTypes[a.action_type] || 0) + 1; });
    const svoTotal = svoActions.length;
    const svoNoAns = svoActionTypes['не_дозвон'] || 0;

    groups.push({
        id: 'svo', name: '📞 СВО (основной)', type: 'svo',
        total_leads: svoLeads.length, total_actions: svoTotal,
        today_actions: svoActions.filter(a => a.created_at && a.created_at.startsWith(today)).length,
        actionTypes: svoActionTypes,
        dialRate: svoTotal > 0 ? Math.round(((svoTotal - svoNoAns) / svoTotal) * 100) : 0,
        user_count: svoUsers.length, workers: svoWorkers
    });

    // --- Each ИНН department ---
    depts.forEach(d => {
        const dActions = allDeptActions.filter(a => a.department_id === d.id);
        const dUsers = allDeptUsers.filter(u => u.department_id === d.id);
        const dLeads = allDeptLeads.filter(l => l.department_id === d.id);
        const dToday = dActions.filter(a => a.created_at && a.created_at.startsWith(today));

        const actionTypes = {};
        dActions.forEach(a => { actionTypes[a.action_type] = (actionTypes[a.action_type] || 0) + 1; });

        const dTotal = dActions.length;
        const dNoAns = actionTypes['не_дозвон'] || 0;

        const workers = dUsers.map(u => {
            const uActions = dActions.filter(a => a.user_id === u.id);
            const uToday = dToday.filter(a => a.user_id === u.id);
            const uAT = {}; uActions.forEach(a => { uAT[a.action_type] = (uAT[a.action_type] || 0) + 1; });
            const uTT = {}; uToday.forEach(a => { uTT[a.action_type] = (uTT[a.action_type] || 0) + 1; });
            const uTotal = uActions.length;
            const uNo = uAT['не_дозвон'] || 0;
            return {
                user_id: u.id, name: u.display_name,
                total: uTotal, today: uToday.length,
                'не_дозвон': uNo, 'перезвон': uAT['перезвон']||0, 'передал': uAT['передал']||0,
                'срез_на_доках': uAT['срез_на_доках']||0, 'скип_приветствие': uAT['скип_приветствие']||0,
                dialRate: uTotal > 0 ? Math.round(((uTotal - uNo) / uTotal) * 100) : 0,
                today_total: uToday.length,
                todayDialRate: uToday.length > 0 ? Math.round(((uToday.length - (uTT['не_дозвон']||0)) / uToday.length) * 100) : 0
            };
        }).filter(w => w.total > 0).sort((a, b) => b.total - a.total);

        groups.push({
            id: d.id, name: '🏢 ' + d.name, type: 'inn',
            total_leads: dLeads.length, total_actions: dTotal,
            today_actions: dToday.length,
            actionTypes, dialRate: dTotal > 0 ? Math.round(((dTotal - dNoAns) / dTotal) * 100) : 0,
            user_count: dUsers.length, workers
        });
    });

    // ===== DAILY ACTIVITY (date range or 14 days) =====
    const dailyActivity = {};
    if (hasDateFilter) {
        const start = new Date(date_from || '2020-01-01');
        const end = new Date(date_to || today);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dailyActivity[d.toISOString().slice(0, 10)] = { total: 0, 'не_дозвон': 0, 'передал': 0, 'перезвон': 0, 'срез_на_доках': 0 };
        }
    } else {
        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            dailyActivity[d.toISOString().slice(0, 10)] = { total: 0, 'не_дозвон': 0, 'передал': 0, 'перезвон': 0, 'срез_на_доках': 0 };
        }
    }
    unifiedActions.forEach(a => {
        const day = (a.created_at || '').slice(0, 10);
        if (dailyActivity[day]) {
            dailyActivity[day].total++;
            if (dailyActivity[day][a.action_type] !== undefined) dailyActivity[day][a.action_type]++;
        }
    });

    // ===== TOP WORKERS (all sources combined) =====
    const topMap = {};
    // СВО workers
    svoActions.forEach(a => {
        const key = 'svo_' + a.user_id;
        if (!topMap[key]) {
            const u = db.findOne('users', u => u.id === a.user_id);
            topMap[key] = { user_id: a.user_id, name: u ? u.display_name : '?', department: 'СВО', total: 0, today: 0, actions: {}, todayActions: {} };
        }
        topMap[key].total++;
        topMap[key].actions[a.action_type] = (topMap[key].actions[a.action_type] || 0) + 1;
        if (a.created_at && a.created_at.startsWith(today)) { topMap[key].today++; topMap[key].todayActions[a.action_type] = (topMap[key].todayActions[a.action_type] || 0) + 1; }
    });
    // ИНН workers
    allDeptActions.forEach(a => {
        const key = 'inn_' + a.user_id;
        if (!topMap[key]) {
            const u = allDeptUsers.find(u => u.id === a.user_id);
            const dept = u ? depts.find(d => d.id === u.department_id) : null;
            topMap[key] = { user_id: a.user_id, name: u ? u.display_name : '?', department: dept ? dept.name : 'ИНН', total: 0, today: 0, actions: {}, todayActions: {} };
        }
        topMap[key].total++;
        topMap[key].actions[a.action_type] = (topMap[key].actions[a.action_type] || 0) + 1;
        if (a.created_at && a.created_at.startsWith(today)) { topMap[key].today++; topMap[key].todayActions[a.action_type] = (topMap[key].todayActions[a.action_type] || 0) + 1; }
    });
    const topWorkers = Object.values(topMap).map(w => {
        const no = w.actions['не_дозвон'] || 0;
        w.dialRate = w.total > 0 ? Math.round(((w.total - no) / w.total) * 100) : 0;
        w['передал'] = w.actions['передал'] || 0;
        w['не_дозвон'] = no;
        w['перезвон'] = w.actions['перезвон'] || 0;
        w['срез_на_доках'] = w.actions['срез_на_доках'] || 0;
        return w;
    }).sort((a, b) => b.total - a.total);

    res.json({
        totalLeads: svoLeads.length + allDeptLeads.length,
        totalActions, totalDepts: depts.length + 1,
        totalWorkers: svoUsers.length + allDeptUsers.length,
        globalActionTypes, globalDialRate,
        todayCalls, todayDialRate, todayActionTypes,
        departments: groups, dailyActivity, topWorkers,
        dateRange: { from: date_from || null, to: date_to || null }
    });
});

// --- VIP Lead Distribution Helper ---
function _extractLeadAmount(lead) {
    if (!lead.extra) return 0;
    try {
        const extra = typeof lead.extra === 'string' ? JSON.parse(lead.extra) : lead.extra;
        for (const [k, v] of Object.entries(extra)) {
            const kl = k.toLowerCase();
            if (kl.includes('сумм') || kl.includes('вклад') || kl.includes('баланс') || kl.includes('депозит')) {
                const str = String(v);
                // Format: "Общая сумма за 2025 р. : 357425" — take number after last ':'
                const colonIdx = str.lastIndexOf(':');
                if (colonIdx !== -1) {
                    const afterColon = str.slice(colonIdx + 1).replace(/\s/g, '');
                    const m = afterColon.match(/(\d+)/);
                    if (m) return parseInt(m[1], 10);
                }
                // Fallback: take last number in string
                const allNums = str.match(/\d+/g);
                if (allNums && allNums.length) return parseInt(allNums[allNums.length - 1], 10);
            }
        }
    } catch(e) {}
    return 0;
}

function _getBaseAmountConfig(baseId) {
    if (!baseId) return null;
    const base = db.findOne('dept_bases', b => b.id === baseId);
    if (!base || !base.vip_config) return null;
    try {
        const cfg = typeof base.vip_config === 'string' ? JSON.parse(base.vip_config) : base.vip_config;
        return (cfg && cfg.enabled) ? cfg : null;
    } catch(e) { return null; }
}

// --- Department Worker Endpoints (for dept workers logged in) ---
function requireDeptAuth(req, res, next) {
    if (!req.session.userId || !req.session.department_id) return res.status(401).json({ error: 'Не авторизован' });
    next();
}

// Get next lead for dept worker (with per-worker amount routing)
app.get('/api/dept/leads/next', requireDeptAuth, (req, res) => {
    const userId = req.session.userId;
    const deptId = req.session.department_id;
    const disabledBases = db.findAll('dept_bases', b => b.department_id === deptId && !b.enabled).map(b => b.id);

    // Get bases assigned to specific workers (not this worker)
    // Handle assigned_workers being either a JSON string or a raw array
    const _parseAW = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        try { return JSON.parse(raw); } catch(e) { return []; }
    };
    const restrictedBases = db.findAll('dept_bases', b => {
        if (b.department_id !== deptId) return false;
        const aw = _parseAW(b.assigned_workers);
        return aw.length > 0 && !aw.includes(userId);
    }).map(b => b.id);

    const excludedBases = [...disabledBases, ...restrictedBases];

    // Cache configs per base
    const cfgCache = {};
    const getCfg = (baseId) => {
        if (cfgCache[baseId] !== undefined) return cfgCache[baseId];
        cfgCache[baseId] = _getBaseAmountConfig(baseId);
        return cfgCache[baseId];
    };

    // Per-worker amount filter
    const passesAmountFilter = (lead) => {
        const cfg = getCfg(lead.base_id);
        if (!cfg) return true; // No config = everyone gets everything
        const underMgrs = cfg.under_managers || [];
        const overMgrs = cfg.over_managers || [];
        const isUnderWorker = underMgrs.includes(userId);
        const isOverWorker = overMgrs.includes(userId);
        // Worker not in any list = gets ALL leads
        if (!isUnderWorker && !isOverWorker) return true;
        const amount = _extractLeadAmount(lead);
        if (isUnderWorker) return amount < 1000000;
        if (isOverWorker) return amount >= 1000000;
        return true;
    };

    // Check already assigned
    const myLead = db.findOne('dept_leads', l =>
        l.department_id === deptId && l.status === 'new' && l.assigned_to === userId &&
        (!l.base_id || !excludedBases.includes(l.base_id))
    );
    if (myLead) {
        // Check INN-called threshold for this lead's base
        if (myLead.base_id) {
            const baseLeads = db.findAll('dept_leads', l => l.base_id === myLead.base_id);
            const totalInBase = baseLeads.length;
            const innCalledCount = baseLeads.filter(l => l.status === 'inn_called').length;
            const innCalledPct = totalInBase > 0 ? (innCalledCount / totalInBase) * 100 : 0;
            if (innCalledPct >= 10) {
                myLead._inn_warning = true;
                myLead._inn_called_pct = Math.round(innCalledPct);
            }
        }
        return res.json(myLead);
    }

    // Pick unassigned (with amount filter + income priority tiers)
    let available = db.findAll('dept_leads', l =>
        l.department_id === deptId && l.status === 'new' &&
        (!l.base_id || !excludedBases.includes(l.base_id)) &&
        (l.assigned_to === null || l.assigned_to === undefined)
    ).filter(passesAmountFilter);

    if (available.length === 0) return res.json(null);

    // Check active priority tiers (global setting) — income-based priority for INN
    let activeTiers = [];
    try { activeTiers = JSON.parse(db.getSetting('priority_tiers') || '[]'); } catch(e) {}

    if (activeTiers.length > 0) {
        // Tier scoring: leads matching active tiers get priority, highest tier first
        const getTierScore = (lead) => {
            const amt = _extractLeadAmount(lead);
            if (amt >= 3000000 && activeTiers.includes('3m_plus')) return 4;
            if (amt >= 2000000 && amt < 3000000 && activeTiers.includes('2m_3m')) return 3;
            if (amt >= 1000000 && amt < 2000000 && activeTiers.includes('1m_2m')) return 2;
            return 0; // Not in any active tier
        };
        available.sort((a, b) => {
            const scoreA = getTierScore(a);
            const scoreB = getTierScore(b);
            if (scoreA !== scoreB) return scoreB - scoreA;
            // Within same tier, sort by amount desc
            return _extractLeadAmount(b) - _extractLeadAmount(a);
        });
        const lead = available[0];
        db.update('dept_leads', l => l.id === lead.id, { assigned_to: userId, assigned_at: new Date().toISOString() });
        // Check INN-called threshold
        if (lead.base_id) {
            const baseLeads = db.findAll('dept_leads', l => l.base_id === lead.base_id);
            const totalInBase = baseLeads.length;
            const innCalledCount = baseLeads.filter(l => l.status === 'inn_called').length;
            const innCalledPct = totalInBase > 0 ? (innCalledCount / totalInBase) * 100 : 0;
            if (innCalledPct >= 10) {
                lead._inn_warning = true;
                lead._inn_called_pct = Math.round(innCalledPct);
            }
        }
        return res.json(lead);
    }
    // Fresh-first priority: sort by base created_at desc (newest first)
    const freshFirst = db.getSetting('fresh_first_inn') === '1';
    if (freshFirst) {
        const baseCreatedCache = {};
        available.forEach(l => {
            if (l.base_id && !baseCreatedCache[l.base_id]) {
                const b = db.findOne('dept_bases', x => x.id === l.base_id);
                baseCreatedCache[l.base_id] = b ? (b.created_at || '') : '';
            }
        });
        available.sort((a, b) => {
            const ca = baseCreatedCache[a.base_id] || '';
            const cb = baseCreatedCache[b.base_id] || '';
            return cb.localeCompare(ca); // newest first
        });
    }

    const lead = freshFirst ? available[0] : available[Math.floor(Math.random() * available.length)];
    db.update('dept_leads', l => l.id === lead.id, { assigned_to: userId, assigned_at: new Date().toISOString() });
    // Check INN-called threshold
    if (lead.base_id) {
        const baseLeads = db.findAll('dept_leads', l => l.base_id === lead.base_id);
        const totalInBase = baseLeads.length;
        const innCalledCount = baseLeads.filter(l => l.status === 'inn_called').length;
        const innCalledPct = totalInBase > 0 ? (innCalledCount / totalInBase) * 100 : 0;
        if (innCalledPct >= 10) {
            lead._inn_warning = true;
            lead._inn_called_pct = Math.round(innCalledPct);
        }
    }
    res.json(lead);
});

// ===== HELPER: Extract death year from lead data =====
function _extractDeathYear(lead) {
    // 1) SVO leads: death date is inside deceased_name field
    if (lead.deceased_name) {
        const dn = lead.deceased_name;
        // Pattern: "Дата смерти: DD.MM.YYYY"
        const dsMatch = dn.match(/[Дд]ата\s*смерти[:\s]+(\d{2})[.\-/](\d{2})[.\-/](\d{4})/);
        if (dsMatch) return dsMatch[3];
        // Pattern: "YYYY-MM-DD" (ISO date after birth date, e.g. "20.05.1980 - 2024-12-08")
        const isoMatch = dn.match(/\d{2}\.\d{2}\.\d{4}\s*[-–]\s*(20\d{2})-\d{2}-\d{2}/);
        if (isoMatch) return isoMatch[1];
        // Pattern: any "20XX-MM-DD" that's not the birth date
        const allIso = [...dn.matchAll(/(20\d{2})-\d{2}-\d{2}/g)];
        if (allIso.length > 0) return allIso[0][1]; // first ISO date = death date
    }

    // 2) INN/Dept leads: death date in extra_data JSON fields
    let extra = {};
    try {
        const raw = lead.extra_data || lead.extra || '';
        extra = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch(e) { return ''; }
    if (!extra || typeof extra !== 'object') return '';

    // Search for keys containing death-related words
    const deathKeys = Object.keys(extra).filter(k => {
        const kl = k.toLowerCase();
        return kl.includes('смерт') || kl.includes('death') || kl.includes('дата смерти') || kl.includes('date_death') || kl.includes('умер');
    });

    for (const key of deathKeys) {
        const val = String(extra[key] || '');
        const match4 = val.match(/(20\d{2})/);
        if (match4) return match4[1];
    }

    return '';
}

// ===== DEATH YEAR PRIORITY SETTING =====
app.get('/api/admin/death-year-priority', requireAdmin, (req, res) => {
    const year = db.getSetting('priority_death_year') || '';
    res.json({ year });
});

app.post('/api/admin/death-year-priority', requireAdmin, (req, res) => {
    const { year } = req.body; // '2024', '2025', '2026', or '' to clear
    db.setSetting('priority_death_year', year || '');
    console.log(`[PRIORITY] Death year priority set to: ${year || 'OFF'}`);
    res.json({ ok: true, year: year || '' });
});

// ===== DEATH YEAR STATS — count SVO leads by death year (OPTIMIZED) =====
app.get('/api/admin/death-year-stats', requireAdmin, (req, res) => {
    const t0 = Date.now();
    const years = { '2024': { total: 0, new: 0 }, '2025': { total: 0, new: 0 }, '2026': { total: 0, new: 0 }, other: { total: 0, new: 0 } };

    // Only scan NEW leads from enabled bases (much faster than scanning all)
    const disabledSvo = db.findAll('bases', b => !b.enabled).map(b => b.id);
    const newLeads = db.findAll('leads', l =>
        l.status === 'new' &&
        (!l.base_id || !disabledSvo.includes(l.base_id))
    );

    for (const lead of newLeads) {
        // Fast extraction: just search for year patterns in deceased_name
        let deathYear = '';
        const dn = lead.deceased_name || '';
        if (dn.length > 0) {
            // Quick check: "Дата смерти:" pattern
            const dsIdx = dn.indexOf('Дата смерти');
            if (dsIdx !== -1) {
                const after = dn.substring(dsIdx, dsIdx + 40);
                const m = after.match(/(20\d{2})/);
                if (m) deathYear = m[1];
            }
            // Fallback: ISO date "YYYY-MM-DD"
            if (!deathYear) {
                const m = dn.match(/(20\d{2})-\d{2}-\d{2}/);
                if (m) deathYear = m[1];
            }
        }
        const bucket = ['2024','2025','2026'].includes(deathYear) ? deathYear : 'other';
        years[bucket].new++;
        years[bucket].total++;
    }

    console.log(`[DEATH-YEAR-STATS] ${newLeads.length} new leads scanned in ${Date.now() - t0}ms`);
    res.json({ years, priority: db.getSetting('priority_death_year') || '' });
});



// Action on dept lead
app.post('/api/dept/leads/:id/action', requireDeptAuth, (req, res) => {
    const { action, comment } = req.body;
    const leadId = parseInt(req.params.id);
    const userId = req.session.userId;
    const deptId = req.session.department_id;

    const validActions = ['не_дозвон', 'скип_приветствие', 'скип', 'перезвон', 'передал', 'срез_на_доках', 'другой_человек', 'говорил_1.5', 'звонили_по_инн'];
    if (!validActions.includes(action)) return res.status(400).json({ error: 'Неизвестное действие' });

    db.insert('dept_lead_actions', {
        department_id: deptId, lead_id: leadId, user_id: userId,
        action_type: action, comment: comment || '', created_at: new Date().toISOString()
    });

    const statusMap = { 'перезвон': 'callback', 'передал': 'passed', 'срез_на_доках': 'docs', 'не_дозвон': 'no_answer', 'скип_приветствие': 'skipped', 'скип': 'skipped', 'другой_человек': 'other_person', 'говорил_1.5': 'talked', 'звонили_по_инн': 'inn_called' };
    db.update('dept_leads', l => l.id === leadId, { status: statusMap[action] || 'new', assigned_to: userId, last_comment: comment || '', last_comment_at: new Date().toISOString() });

    // Admin push notification for передал
    if (action === 'передал') {
        const lead = db.findOne('dept_leads', l => l.id === leadId);
        const user = db.findOne('dept_users', u => u.id === userId);
        const userName = user ? user.display_name : 'Работник';
        pushAdminEvent('pass', '✅ ' + userName + ' передал (ИНН)', lead ? (lead.fio || '') : '');
        if (lead && lead.base_id) _checkBaseCompletion(lead.base_id, 'dept');
    }

    res.json({ ok: true });
});

// Get my dept callbacks (leads marked as callback by this worker)
app.get('/api/dept/my-callbacks', requireDeptAuth, (req, res) => {
    const userId = req.session.userId;
    const deptId = req.session.department_id;
    const callbacks = db.findAll('dept_leads', l =>
        l.department_id === deptId && l.status === 'callback' && l.assigned_to === userId
    );
    // Attach last comment from dept_lead_actions
    const actions = db.findAll('dept_lead_actions');
    const result = callbacks.map(cb => {
        const lastAction = actions
            .filter(a => a.lead_id === cb.id && a.user_id === userId && a.action_type === 'перезвон')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        return {
            ...cb,
            callback_comment: lastAction ? lastAction.comment : (cb.last_comment || ''),
            callback_date: lastAction ? lastAction.created_at : cb.last_comment_at
        };
    });
    res.json(result);
});

// Return a callback lead back to call queue (status → new, preserve comment)
app.post('/api/dept/callback-return/:id', requireDeptAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const userId = req.session.userId;
    const deptId = req.session.department_id;

    const lead = db.findOne('dept_leads', l =>
        l.id === leadId && l.department_id === deptId && l.status === 'callback' && l.assigned_to === userId
    );
    if (!lead) return res.status(404).json({ error: 'Перезвон не найден' });

    // Log the return action, preserving original comment
    db.insert('dept_lead_actions', {
        department_id: deptId, lead_id: leadId, user_id: userId,
        action_type: 'callback_return', comment: lead.last_comment || '', created_at: new Date().toISOString()
    });

    // Set status back to new, keep assigned to the same worker so they get it
    db.update('dept_leads', l => l.id === leadId, {
        status: 'new',
        assigned_to: userId,
        callback_comment: lead.last_comment || '',
        assigned_at: new Date().toISOString()
    });

    res.json({ ok: true });
});

// ============ DEPT ARCHIVE — all processed leads by this worker ============
app.get('/api/dept/my-archive', requireDeptAuth, (req, res) => {
    const userId = req.session.userId;
    const deptId = req.session.department_id;
    const myActions = db.findAll('dept_lead_actions', a => a.user_id === userId && a.department_id === deptId);
    const leadIds = [...new Set(myActions.map(a => a.lead_id))];
    const statusNames = { no_answer: '❌ Не дозвон', callback: '📞 Перезвон', passed: '✅ Передал', docs: '📄 Срез', skipped: '⏭ Скип', talked: '🗣️ Говорил', other_person: '👤 Другой' };
    const result = leadIds.map(lid => {
        const lead = db.findOne('dept_leads', l => l.id === lid);
        if (!lead || lead.status === 'new') return null;
        const lastAction = myActions.filter(a => a.lead_id === lid).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
        let data = {};
        try { data = typeof lead.data === 'string' ? JSON.parse(lead.data) : (lead.data || {}); } catch(e) {}
        const name = lead.fio || data['ФИО'] || data['Имя'] || 'Без имени';
        return {
            id: lead.id, name, status: lead.status,
            status_label: statusNames[lead.status] || lead.status,
            last_action: lastAction ? lastAction.action_type : '',
            last_action_at: lastAction ? lastAction.created_at : '',
            last_comment: lastAction ? lastAction.comment : ''
        };
    }).filter(Boolean).sort((a,b) => new Date(b.last_action_at) - new Date(a.last_action_at));
    res.json(result);
});

// Dept lead action history
app.get('/api/dept/leads/:id/history', requireDeptAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const deptId = req.session.department_id;
    const actions = db.findAll('dept_lead_actions', a => a.lead_id === leadId && a.department_id === deptId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
    const result = actions.map(a => {
        const user = db.findOne('users', u => u.id === a.user_id);
        return { ...a, user_name: user ? user.display_name : '—' };
    });
    res.json(result);
});

// Change dept lead status from archive
app.post('/api/dept/leads/:id/change-status', requireDeptAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const { status } = req.body;
    const deptId = req.session.department_id;
    const userId = req.session.userId;
    const validStatuses = ['new', 'no_answer', 'callback', 'passed', 'docs', 'skipped', 'talked'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const lead = db.findOne('dept_leads', l => l.id === leadId && l.department_id === deptId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    db.update('dept_leads', l => l.id === leadId, { status });
    db.insert('dept_lead_actions', {
        lead_id: leadId, user_id: userId, department_id: deptId,
        action_type: 'status_change_' + status, comment: 'Изменение статуса из архива',
        created_at: new Date().toISOString()
    });
    res.json({ ok: true });
});

// Dept worker stats
app.get('/api/dept/my-stats', requireDeptAuth, (req, res) => {
    const userId = req.session.userId;
    const deptId = req.session.department_id;
    const today = new Date().toISOString().slice(0, 10);
    const myActions = db.findAll('dept_lead_actions', a => a.user_id === userId && a.department_id === deptId);
    const myToday = myActions.filter(a => a.created_at && a.created_at.startsWith(today));
    const leads = db.findAll('dept_leads', l => l.department_id === deptId);
    const todayMap = {};
    myToday.forEach(a => { todayMap[a.action_type] = (todayMap[a.action_type] || 0) + 1; });
    res.json({
        today: { total: myToday.length, ...todayMap },
        allTime: { total: myActions.length },
        team: { totalLeads: leads.length, remaining: leads.filter(l => l.status === 'new').length }
    });
});

// Dept base stats
app.get('/api/dept/base-stats', requireDeptAuth, (req, res) => {
    const deptId = req.session.department_id;
    const disabledBases = db.findAll('dept_bases', b => b.department_id === deptId && !b.enabled).map(b => b.id);
    const leads = db.findAll('dept_leads', l => l.department_id === deptId && (!l.base_id || !disabledBases.includes(l.base_id)));
    const total = leads.length;
    const remaining = leads.filter(l => l.status === 'new').length;
    res.json({ total, remaining, called: total - remaining });
});

// Update login to handle dept users
const originalLoginHandler = app.post;

// We need to modify the existing login - add dept_user check to the existing login endpoint
// But we can't easily modify the already-registered route, so we'll add a middleware-like approach
// by using a pre-check. Let's add a separate dept login check.

// Override: patch login to support dept_users too
// We'll intercept by adding another handler that runs first for /api/login
// Express uses the first matching handler, so we need a different approach.
// Let's add a specific dept-login endpoint instead.

app.post('/api/dept-login', (req, res) => {
    const { username, password } = req.body;
    const user = db.findOne('dept_users', u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const dept = db.findOne('departments', d => d.id === user.department_id);
    req.session.userId = user.id;
    req.session.role = user.role || 'dept_worker';
    req.session.displayName = user.display_name;
    req.session.department_id = user.department_id;
    req.session.isDeptUser = true;
    res.json({
        id: user.id, username: user.username, display_name: user.display_name,
        role: user.role, department_id: user.department_id,
        department_name: dept ? dept.name : '', isDeptUser: true
    });
});

app.get('/api/dept/me', requireDeptAuth, (req, res) => {
    const user = db.findOne('dept_users', u => u.id === req.session.userId);
    if (!user) return res.status(401).json({ error: 'Не авторизован' });
    const dept = db.findOne('departments', d => d.id === user.department_id);
    res.json({
        id: user.id, username: user.username, display_name: user.display_name,
        role: user.role, department_id: user.department_id,
        department_name: dept ? dept.name : '', isDeptUser: true
    });
});

// Dept lead search
app.get('/api/dept/search', requireDeptAuth, (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    const deptId = req.session.department_id;
    if (!q) return res.json([]);
    const leads = db.findAll('dept_leads', l =>
        l.department_id === deptId && (
            (l.fio && l.fio.toLowerCase().includes(q)) ||
            (l.phone && l.phone.toLowerCase().includes(q)) ||
            (l.inn && l.inn.toLowerCase().includes(q))
        )
    ).slice(0, 50);
    res.json(leads);
});

// (legacy duplicate removed — full version with assigned_workers filtering is at line ~3274)

// Dept worker: record action on lead (unique URL to avoid route conflicts)
app.post('/api/dept-action/:id', (req, res) => {
    const leadId = parseInt(req.params.id);
    const userId = req.session.userId;
    const deptId = req.session.department_id;
    const action_type = req.body && req.body.action_type;
    const comment = (req.body && req.body.comment) || '';

    console.log('[DEPT-ACTION]', { leadId, action_type, userId, deptId });

    if (!userId || !req.session.isDeptUser) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    if (!action_type) {
        return res.status(400).json({ error: 'action_type обязателен' });
    }

    const lead = db.findOne('dept_leads', l => l.id === leadId);
    if (!lead) {
        return res.status(404).json({ error: 'Лид не найден' });
    }

    const statusMap = {
        'не_дозвон': 'no_answer', 'перезвон': 'callback', 'передал': 'passed',
        'срез_на_доках': 'docs', 'скип': 'skipped', 'говорил_1.5': 'talked'
    };
    const newStatus = statusMap[action_type] || action_type;
    db.update('dept_leads', l => l.id === leadId, {
        status: newStatus,
        updated_at: new Date().toISOString()
    });

    db.insert('dept_lead_actions', {
        dept_lead_id: leadId, department_id: deptId, user_id: userId,
        action_type: action_type, comment: comment,
        created_at: new Date().toISOString()
    });

    console.log('[DEPT-ACTION] OK:', action_type, 'lead:', leadId);
    res.json({ ok: true });
});

// Dept worker: my callbacks
app.get('/api/dept-callbacks', (req, res) => {
    if (!req.session.userId || !req.session.isDeptUser) return res.status(401).json({ error: 'Не авторизован' });
    const userId = req.session.userId;
    const deptId = req.session.department_id;
    // Find all leads this worker marked as callback
    const callbackActions = db.findAll('dept_lead_actions', a => a.user_id === userId && a.action_type === 'перезвон');
    const leadIds = [...new Set(callbackActions.map(a => a.dept_lead_id))];
    const leads = leadIds.map(id => {
        const lead = db.findOne('dept_leads', l => l.id === id && l.department_id === deptId);
        if (!lead || lead.status !== 'callback') return null;
        const lastAction = callbackActions.filter(a => a.dept_lead_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        return { ...lead, callback_at: lastAction ? lastAction.created_at : '', callback_comment: lastAction ? lastAction.comment : '' };
    }).filter(Boolean);
    res.json(leads);
});

// Dept worker: load specific lead by ID
app.get('/api/dept-lead/:id', (req, res) => {
    if (!req.session.userId || !req.session.isDeptUser) return res.status(401).json({ error: 'Не авторизован' });
    const leadId = parseInt(req.params.id);
    const lead = db.findOne('dept_leads', l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Лид не найден' });
    res.json(lead);
});

// Dept worker: lead counts
app.get('/api/dept/leads/counts', requireDeptAuth, (req, res) => {
    const deptId = req.session.department_id;
    const userId = req.session.userId;
    const leads = db.findAll('dept_leads', l => l.department_id === deptId);
    const myActions = db.findAll('dept_lead_actions', a => a.user_id === userId);
    const today = new Date().toISOString().slice(0, 10);
    const todayActions = myActions.filter(a => a.created_at && a.created_at.startsWith(today));
    const counts = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0, talked: 0 };
    leads.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++; });
    res.json({
        total: leads.length,
        ...counts,
        my_today: todayActions.length,
        my_total: myActions.length,
        my_passed: todayActions.filter(a => a.action_type === 'передал').length,
        my_talked: todayActions.filter(a => a.action_type === 'говорил_1.5').length,
        my_no_answer: todayActions.filter(a => a.action_type === 'не_дозвон').length
    });
});

// ===== UNIFIED BASE MANAGEMENT DASHBOARD =====
app.get('/api/admin/all-bases', requireAdmin, (req, res) => {
  try {
    const sections = [];
    // SVO bases
    const svoBases = db.findAll('bases');
    const svoSection = { name: 'СВО Базы', icon: '🎖️', color: '#4ade80', bases: [] };
    svoBases.forEach(b => {
      const leads = db.findAll('leads', l => l.base_id === b.id);
      const total = leads.length;
      const newCount = leads.filter(l => l.status === 'new').length;
      const passed = leads.filter(l => l.status === 'passed').length;
      const noAnswer = leads.filter(l => l.status === 'no_answer').length;
      const callback = leads.filter(l => l.status === 'callback').length;
      const docs = leads.filter(l => l.status === 'docs').length;
      const skipped = leads.filter(l => l.status === 'skipped').length;
      const processed = total - newCount;
      const progress = total > 0 ? Math.round((processed/total)*100) : 0;
      const passRate = processed > 0 ? ((passed/processed)*100).toFixed(1) : '0.0';
      // Best worker
      let bestWorker = null;
      const actions = db.findAll('lead_actions', a => leads.some(l => l.id === a.lead_id) && a.action_type === 'передал');
      if (actions.length) {
        const counts = {};
        actions.forEach(a => { counts[a.user_id] = (counts[a.user_id]||0) + 1; });
        const topId = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
        if (topId) {
          const user = db.findOne('users', u => u.id === parseInt(topId[0]));
          if (user) bestWorker = { name: user.display_name, passes: topId[1] };
        }
      }
      svoSection.bases.push({ id:b.id, name:b.name, type:'svo', enabled:!!b.enabled, total, newCount, passed, noAnswer, callback, docs, skipped, processed, progress, passRate, bestWorker, created_at: b.created_at });
    });
    sections.push(svoSection);
    // INN dept bases
    const depts = db.findAll('departments');
    depts.forEach(dept => {
      const deptBases = db.findAll('dept_bases', b => b.department_id === dept.id);
      if (!deptBases.length) return;
      const deptUsers = db.findAll('dept_users', u => u.department_id === dept.id).map(u => ({ id: u.id, name: u.display_name }));
      const deptSection = { name: dept.name + ' (ИНН)', icon: '🏢', color: '#60a5fa', bases: [] };
      deptBases.forEach(b => {
        const leads = db.findAll('dept_leads', l => l.base_id === b.id);
        const total = leads.length;
        const newCount = leads.filter(l => l.status === 'new').length;
        const passed = leads.filter(l => l.status === 'passed').length;
        const noAnswer = leads.filter(l => l.status === 'no_answer').length;
        const callback = leads.filter(l => l.status === 'callback').length;
        const docs = leads.filter(l => l.status === 'docs').length;
        const skipped = leads.filter(l => l.status === 'skipped').length;
        const processed = total - newCount;
        const progress = total > 0 ? Math.round((processed/total)*100) : 0;
        const passRate = processed > 0 ? ((passed/processed)*100).toFixed(1) : '0.0';
        let bestWorker = null;
        const actions = db.findAll('dept_lead_actions', a => leads.some(l => l.id === a.lead_id) && a.action_type === 'передал');
        if (actions.length) {
          const counts = {};
          actions.forEach(a => { counts[a.user_id] = (counts[a.user_id]||0) + 1; });
          const topId = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
          if (topId) {
            const user = db.findOne('dept_users', u => u.id === parseInt(topId[0]));
            if (user) bestWorker = { name: user.display_name, passes: topId[1] };
          }
        }
        let assignedWorkers = [];
        let assignedNames = [];
        try {
          const _raw = b.assigned_workers;
          if (Array.isArray(_raw)) assignedWorkers = _raw;
          else if (typeof _raw === 'string' && _raw) assignedWorkers = JSON.parse(_raw);
          assignedNames = deptUsers.filter(u => assignedWorkers.includes(u.id)).map(u => u.name);
        } catch(e) { assignedWorkers = []; }
        deptSection.bases.push({ id:b.id, name:b.name, type:'dept', enabled:b.enabled!==false&&b.enabled!==0, total, newCount, passed, noAnswer, callback, docs, skipped, processed, progress, passRate, bestWorker, assignedWorkers, assignedNames, deptUsers, created_at: b.created_at, priority_income: !!b.priority_income, income_under1m: 0, income_1m_2m: 0, income_2m_3m: 0, income_over3m: 0 });
        // Count income stats
        const lastBase = deptSection.bases[deptSection.bases.length-1];
        leads.forEach(l => {
          const amt = _extractLeadAmount(l);
          if (amt >= 3000000) lastBase.income_over3m++;
          else if (amt >= 2000000) lastBase.income_2m_3m++;
          else if (amt >= 1000000) lastBase.income_1m_2m++;
          else lastBase.income_under1m++;
        });
      });
      sections.push(deptSection);
    });
    // Per-section today stats
    const today = new Date().toISOString().slice(0,10);
    const allSvoActions = db.findAll('lead_actions', a => a.created_at && a.created_at.startsWith(today));
    const allDeptActions = db.findAll('dept_lead_actions', a => a.created_at && a.created_at.startsWith(today));

    // SVO today stats
    const svoLeadIds = new Set(sections[0].bases.flatMap(b => db.findAll('leads', l => l.base_id === b.id).map(l => l.id)));
    const svoCalls = allSvoActions.filter(a => svoLeadIds.has(a.lead_id)).length;
    const svoPasses = allSvoActions.filter(a => svoLeadIds.has(a.lead_id) && a.action_type === 'передал').length;
    const svoTopBase = [...sections[0].bases].sort((a,b) => b.passed - a.passed)[0];
    sections[0].todayStats = { todayCalls: svoCalls, todayPasses: svoPasses, topBase: svoTopBase ? { name: svoTopBase.name, passes: svoTopBase.passed } : null };

    // Dept today stats
    for (let i = 1; i < sections.length; i++) {
      const sec = sections[i];
      const secBaseIds = sec.bases.map(b => b.id);
      const secLeadIds = new Set(sec.bases.flatMap(b => db.findAll('dept_leads', l => l.base_id === b.id).map(l => l.id)));
      const dCalls = allDeptActions.filter(a => secLeadIds.has(a.lead_id)).length;
      const dPasses = allDeptActions.filter(a => secLeadIds.has(a.lead_id) && a.action_type === 'передал').length;
      const topB = [...sec.bases].sort((a,b) => b.passed - a.passed)[0];
      sec.todayStats = { todayCalls: dCalls, todayPasses: dPasses, topBase: topB ? { name: topB.name, passes: topB.passed } : null };
    }

    // Global top bases ranking
    const allBases = sections.flatMap(s => s.bases.map(b => ({ ...b, section: s.name })));
    const topBases = allBases.sort((a,b) => b.passed - a.passed).slice(0, 5);

    // Summary
    let totalBases=0, totalLeads=0, activeBases=0, todayPasses=0, totalConv=0, convCount=0;
    sections.forEach(s => s.bases.forEach(b => {
      totalBases++; totalLeads += b.total;
      if (b.enabled && b.newCount > 0) activeBases++;
      const rate = parseFloat(b.passRate);
      if (b.processed > 0) { totalConv += rate; convCount++; }
    }));
    todayPasses = allSvoActions.filter(a => a.action_type === 'передал').length + allDeptActions.filter(a => a.action_type === 'передал').length;
    // DEBUG: income stats
    let dbgUnder=0, dbg1m2m=0, dbg2m3m=0, dbgOver3m=0;
    sections.forEach(s => s.bases.forEach(b => { dbgUnder += (b.income_under1m||0); dbg1m2m += (b.income_1m_2m||0); dbg2m3m += (b.income_2m_3m||0); dbgOver3m += (b.income_over3m||0); }));
    console.log('[DEBUG] Income stats — Under 1M:', dbgUnder, '| 1-2M:', dbg1m2m, '| 2-3M:', dbg2m3m, '| Over 3M:', dbgOver3m);
    let activeTiers = [];
    try { activeTiers = JSON.parse(db.getSetting('priority_tiers') || '[]'); } catch(e) {}
    res.json({ sections, topBases, activeTiers, summary: { totalBases, activeBases, totalLeads, todayPasses, avgConversion: convCount > 0 ? (totalConv/convCount).toFixed(1) : '0.0' }});
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Worker assignment for dept bases
app.get('/api/admin/dept-bases/:id/assigned-workers', requireAdmin, (req, res) => {
  const base = db.findOne('dept_bases', b => b.id === parseInt(req.params.id));
  if (!base) return res.status(404).json({ error: 'Not found' });
  let worker_ids = base.assigned_workers || [];
  if (typeof worker_ids === 'string') try { worker_ids = JSON.parse(worker_ids); } catch(e) { worker_ids = []; }
  if (!Array.isArray(worker_ids)) worker_ids = [];
  res.json({ worker_ids });
});

app.put('/api/admin/dept-bases/:id/assign-workers', requireAdmin, (req, res) => {
  const { worker_ids } = req.body;
  db.update('dept_bases', b => b.id === parseInt(req.params.id), { assigned_workers: JSON.stringify(worker_ids || []) });
  res.json({ ok: true });
});

// Return leads for dept bases
app.post('/api/admin/dept-bases/:id/return-leads', requireAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['callback', 'no_answer', 'skipped'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const baseId = parseInt(req.params.id);
  const leads = db.findAll('dept_leads', l => l.base_id === baseId && l.status === status);
  leads.forEach(l => { db.update('dept_leads', r => r.id === l.id, { status: 'new' }); });
  res.json({ reset: leads.length });
});

// Toggle priority tier (global setting: 'priority_tiers' = JSON array of active tiers)
// Valid tiers: 'under_1m', '1m_2m', '2m_3m', '3m_plus'
app.post('/api/admin/priority-tier-toggle', requireAdmin, (req, res) => {
  const { tier } = req.body;
  const validTiers = ['under_1m', '1m_2m', '2m_3m', '3m_plus'];
  if (!validTiers.includes(tier)) return res.status(400).json({ error: 'Invalid tier' });
  let activeTiers = [];
  try { activeTiers = JSON.parse(db.getSetting('priority_tiers') || '[]'); } catch(e) {}
  if (activeTiers.includes(tier)) {
    activeTiers = activeTiers.filter(t => t !== tier);
  } else {
    activeTiers.push(tier);
  }
  db.setSetting('priority_tiers', JSON.stringify(activeTiers));
  console.log('[PRIORITY] Active tiers:', activeTiers);
  res.json({ ok: true, activeTiers });
});

// Get active priority tiers
app.get('/api/admin/priority-tiers', requireAdmin, (req, res) => {
  let activeTiers = [];
  try { activeTiers = JSON.parse(db.getSetting('priority_tiers') || '[]'); } catch(e) {}
  res.json({ activeTiers });
});

// Toggle priority_income for single dept base
app.post('/api/admin/dept-bases/:id/priority-income', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const base = db.findOne('dept_bases', b => b.id === id);
  if (!base) return res.status(404).json({ error: 'Not found' });
  const newVal = !base.priority_income;
  db.update('dept_bases', b => b.id === id, { priority_income: newVal });
  res.json({ ok: true, priority_income: newVal });
});

// Debug: test income extraction
app.get('/api/admin/income-test', requireAdmin, (req, res) => {
  const allLeads = db.findAll('dept_leads');
  let under1m = 0, from1m2m = 0, from2m3m = 0, over3m = 0, zero = 0, samples = [];
  allLeads.forEach(l => {
    const amt = _extractLeadAmount(l);
    if (amt >= 3000000) { over3m++; if (samples.length < 3) samples.push({ id: l.id, fio: l.fio, amount: amt, cat: '3M+' }); }
    else if (amt >= 2000000) { from2m3m++; }
    else if (amt >= 1000000) { from1m2m++; }
    else if (amt > 0) under1m++;
    else zero++;
  });
  res.json({ total: allLeads.length, under_1m: under1m, '1m_2m': from1m2m, '2m_3m': from2m3m, over_3m: over3m, zero, samples });
});

app.get('/api/admin/search-leads', requireAdmin, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 2) return res.json({ results: [] });
  const results = [];

  // Helper: get income category label
  const getIncomeCategory = (amt) => {
    if (amt >= 3000000) return { label: '3М+', color: '#f97316', icon: '🔴' };
    if (amt >= 2000000) return { label: '2-3М', color: '#fbbf24', icon: '🟡' };
    if (amt >= 1000000) return { label: '1-2М', color: '#4ade80', icon: '🟢' };
    if (amt > 0) return { label: 'до 1М', color: '#60a5fa', icon: '🔵' };
    return { label: '—', color: 'var(--t3)', icon: '⚪' };
  };

  // Helper: parse extra fields
  const parseExtra = (extra) => {
    if (!extra) return {};
    try { return typeof extra === 'string' ? JSON.parse(extra) : extra; } catch(e) { return {}; }
  };

  // SVO leads
  const svoBases = db.findAll('bases');
  const svoBaseMap = {};
  svoBases.forEach(b => svoBaseMap[b.id] = b.name);
  const svoLeads = db.findAll('leads', l => {
    const name = (l.deceased_name || '').toLowerCase();
    const phone = (l.phones || '').toLowerCase();
    const relatives = (typeof l.relatives === 'string' ? l.relatives : JSON.stringify(l.relatives || [])).toLowerCase();
    return name.includes(q) || phone.includes(q) || relatives.includes(q);
  });
  svoLeads.forEach(l => {
    results.push({
      id: l.id, type: 'svo',
      name: l.deceased_name || '',
      phones: l.phones || '',
      status: l.status,
      baseName: svoBaseMap[l.base_id] || 'Без базы',
      baseId: l.base_id,
      dept: 'СВО',
      region: l.region || '',
      birthday: l.birthday || '',
      address: l.address || '',
      extra: parseExtra(l.extra),
      amount: 0,
      incomeCategory: getIncomeCategory(0),
      created_at: l.created_at
    });
  });

  // Dept leads
  const depts = db.findAll('departments');
  const deptMap = {};
  depts.forEach(d => deptMap[d.id] = d.name);
  const deptBasesAll = db.findAll('dept_bases');
  const deptBaseMap = {};
  const deptBaseOwner = {};
  deptBasesAll.forEach(b => { deptBaseMap[b.id] = b.name; deptBaseOwner[b.id] = deptMap[b.department_id] || 'ИНН'; });
  const deptLeads = db.findAll('dept_leads', l => {
    const name = (l.fio || l.full_name || l.deceased_name || '').toLowerCase();
    const phone = (l.phone || l.phones || '').toLowerCase();
    const addr = (l.address || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || addr.includes(q);
  });
  deptLeads.forEach(l => {
    const amt = _extractLeadAmount(l);
    const extraParsed = parseExtra(l.extra || l.extra_data);
    results.push({
      id: l.id, type: 'dept',
      name: l.fio || l.full_name || l.deceased_name || '',
      phones: l.phone || l.phones || '',
      status: l.status,
      baseName: deptBaseMap[l.base_id] || 'Без базы',
      baseId: l.base_id,
      dept: deptBaseOwner[l.base_id] || 'ИНН',
      region: l.region || '',
      birthday: l.birthday || '',
      address: l.address || '',
      extra: extraParsed,
      amount: amt,
      incomeCategory: getIncomeCategory(amt),
      created_at: l.created_at,
      assigned_to: l.assigned_to,
      updated_at: l.updated_at
    });
  });
  res.json({ results: results.slice(0, 100) });
});

// Admin: change lead status (SVO or dept)
app.post('/api/admin/change-lead-status', requireAdmin, (req, res) => {
    const { lead_id, type, new_status } = req.body;
    const validStatuses = ['new', 'no_answer', 'callback', 'passed', 'docs', 'skipped', 'talked', 'other_person'];
    if (!validStatuses.includes(new_status)) return res.status(400).json({ error: 'Неизвестный статус' });
    if (!lead_id) return res.status(400).json({ error: 'lead_id обязателен' });

    if (type === 'dept') {
        const lead = db.findOne('dept_leads', l => l.id === lead_id);
        if (!lead) return res.status(404).json({ error: 'Лид не найден' });
        db.update('dept_leads', l => l.id === lead_id, { status: new_status, updated_at: new Date().toISOString() });
        res.json({ ok: true, message: `Статус изменён на ${new_status}` });
    } else {
        const lead = db.findOne('leads', l => l.id === lead_id);
        if (!lead) return res.status(404).json({ error: 'Лид не найден' });
        db.update('leads', l => l.id === lead_id, { status: new_status, updated_at: new Date().toISOString() });
        res.json({ ok: true, message: `Статус изменён на ${new_status}` });
    }
});

// ============ STAKES (Ставки / заработок) ============
app.get('/api/admin/stakes', requireAdmin, (req, res) => {
    const weekOffset = parseInt(req.query.week_offset) || 0; // 0=current, 1=last week, etc.

    // Calculate Monday of the target week
    const now = new Date();
    // Get current Monday (ISO week: Mon=1)
    const currentDay = now.getDay(); // 0=Sun, 1=Mon...
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday - (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);

    // Build array of 6 days: Mon-Sat
    const days = [];
    for (let i = 0; i < 6; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    }

    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

    // Helper: calculate earnings from pass count
    function calcEarnings(passes) {
        if (passes >= 4) return 20;
        if (passes >= 2) return 10;
        return 0;
    }

    // ===== СВО =====
    const svoUsers = db.findAll('users', u => u.role === 'worker');
    const svoActions = db.findAll('lead_actions');

    const svoWorkers = svoUsers.map(u => {
        const dailyData = {};
        let weekTotal = 0;

        days.forEach((day, idx) => {
            const dayActions = svoActions.filter(a =>
                a.user_id === u.id &&
                a.action_type === 'передал' &&
                a.created_at && a.created_at.startsWith(day)
            );
            const passes = dayActions.length;
            const earned = calcEarnings(passes);
            const canSpin = passes >= 5;
            weekTotal += earned;

            dailyData[day] = { passes, earned, canSpin, dayName: dayNames[idx] };
        });

        return {
            user_id: u.id,
            name: u.display_name,
            days: dailyData,
            weekTotal
        };
    }).filter(w => {
        // Only show workers who have any passes in ANY week (not just empty rows)
        return Object.values(w.days).some(d => d.passes > 0) || true; // show all workers
    });

    // ===== ИНН =====
    const depts = db.findAll('departments');
    const allDeptUsers = db.findAll('dept_users');
    const allDeptActions = db.findAll('dept_lead_actions');

    const innGroups = depts.map(dept => {
        const deptUsers = allDeptUsers.filter(u => u.department_id === dept.id);
        const deptActions = allDeptActions.filter(a => a.department_id === dept.id);

        const workers = deptUsers.map(u => {
            const dailyData = {};
            let weekTotal = 0;

            days.forEach((day, idx) => {
                const dayActions = deptActions.filter(a =>
                    a.user_id === u.id &&
                    a.action_type === 'передал' &&
                    a.created_at && a.created_at.startsWith(day)
                );
                const passes = dayActions.length;
                const earned = calcEarnings(passes);
                weekTotal += earned;

                dailyData[day] = { passes, earned, canSpin: false, dayName: dayNames[idx] };
            });

            return {
                user_id: u.id,
                name: u.display_name,
                days: dailyData,
                weekTotal
            };
        });

        return {
            dept_id: dept.id,
            dept_name: dept.name,
            workers
        };
    });

    // Week label
    const weekStart = days[0];
    const weekEnd = days[5];
    const formatDate = (d) => {
        const parts = d.split('-');
        return `${parts[2]}.${parts[1]}`;
    };

    res.json({
        week_offset: weekOffset,
        week_label: `${formatDate(weekStart)} – ${formatDate(weekEnd)}`,
        week_start: weekStart,
        week_end: weekEnd,
        days,
        dayNames,
        svo: { workers: svoWorkers },
        inn: innGroups
    });
});

// Toggle single dept base (enable/disable)
app.post('/api/admin/dept-bases/:id/toggle', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const newEnabled = base.enabled ? 0 : 1;
    db.update('dept_bases', b => b.id === id, { enabled: newEnabled });
    console.log(`[INN-BASE] ${base.name} toggled to ${newEnabled ? 'ENABLED' : 'DISABLED'}`);
    res.json({ ok: true, enabled: newEnabled });
});

// ============ ИНН БАЗЫ — MANAGEMENT PANEL ============

// ============ INN GROUPED BY DATE ============
app.get('/api/admin/inn-grouped', requireAdmin, (req, res) => {
    const depts = db.findAll('departments');
    const allWorkers = [];
    const allBasesRaw = [];

    depts.forEach(dept => {
        const bases = db.findAll('dept_bases', b => b.department_id === dept.id);
        const deptUsers = db.findAll('dept_users', u => u.department_id === dept.id);
        deptUsers.forEach(u => {
            if (!allWorkers.find(w => w.id === u.id)) {
                allWorkers.push({ id: u.id, name: u.display_name, department_id: dept.id, department_name: dept.name });
            }
        });

        bases.forEach(base => {
            const leads = db.findAll('dept_leads', l => l.base_id === base.id);
            const total = leads.length;
            const stats = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0, talked: 0, other_person: 0, inn_called: 0 };
            leads.forEach(l => { if (stats[l.status] !== undefined) stats[l.status]++; });
            const processed = total - stats.new;
            const progress = total > 0 ? Math.round((processed / total) * 100) : 0;

            let assignedWorkers = [];
            try {
                const _raw = base.assigned_workers;
                if (Array.isArray(_raw)) assignedWorkers = _raw;
                else if (typeof _raw === 'string' && _raw) assignedWorkers = JSON.parse(_raw);
            } catch(e) {}

            const workerNames = assignedWorkers.length > 0
                ? assignedWorkers.map(wid => { const u = deptUsers.find(u => u.id === wid); return u ? u.display_name : '?'; })
                : [];

            allBasesRaw.push({
                id: base.id, name: base.name, department_id: dept.id, department_name: dept.name,
                enabled: base.enabled, total, stats, processed, progress,
                inn_called_pct: total > 0 ? Math.round((stats.inn_called / total) * 100) : 0,
                assigned_workers: assignedWorkers, worker_names: workerNames,
                created_at: base.created_at
            });
        });
    });

    // Group by date
    const dayGroups = {};
    allBasesRaw.forEach(b => {
        const day = (b.created_at || '').slice(0, 10) || 'unknown';
        if (!dayGroups[day]) dayGroups[day] = [];
        dayGroups[day].push(b);
    });

    // Build sorted day array (newest first)
    const days = Object.keys(dayGroups).sort((a, b) => b.localeCompare(a)).map(day => {
        const bases = dayGroups[day];
        const totalLeads = bases.reduce((s, b) => s + b.total, 0);
        const totalNew = bases.reduce((s, b) => s + (b.stats.new || 0), 0);
        const totalNA = bases.reduce((s, b) => s + (b.stats.no_answer || 0), 0);
        const totalPassed = bases.reduce((s, b) => s + (b.stats.passed || 0), 0);
        const totalCB = bases.reduce((s, b) => s + (b.stats.callback || 0), 0);
        const totalSkipped = bases.reduce((s, b) => s + (b.stats.skipped || 0), 0);
        const processed = totalLeads - totalNew;
        const progress = totalLeads > 0 ? Math.round((processed / totalLeads) * 100) : 0;
        const allEnabled = bases.every(b => b.enabled);
        const someEnabled = bases.some(b => b.enabled);

        return {
            date: day, baseCount: bases.length, totalLeads, totalNew, totalNA, totalPassed,
            totalCB, totalSkipped, processed, progress, allEnabled, someEnabled,
            bases: bases.sort((a, b) => (b.stats.passed || 0) - (a.stats.passed || 0))
        };
    });

    // Global summary
    const globalLeads = allBasesRaw.reduce((s, b) => s + b.total, 0);
    const globalNew = allBasesRaw.reduce((s, b) => s + (b.stats.new || 0), 0);
    const globalNA = allBasesRaw.reduce((s, b) => s + (b.stats.no_answer || 0), 0);
    const globalPassed = allBasesRaw.reduce((s, b) => s + (b.stats.passed || 0), 0);
    const globalBases = allBasesRaw.length;
    const globalEnabled = allBasesRaw.filter(b => b.enabled).length;
    const freshFirst = db.getSetting('fresh_first_inn') === '1';

    res.json({
        days,
        summary: { globalLeads, globalNew, globalNA, globalPassed, globalBases, globalEnabled },
        freshFirst,
        workers: allWorkers
    });
});

// Toggle all bases of a specific day
app.post('/api/admin/inn-day/toggle', requireAdmin, (req, res) => {
    const { date, enabled } = req.body;
    const depts = db.findAll('departments');
    let count = 0;
    depts.forEach(dept => {
        const bases = db.findAll('dept_bases', b => b.department_id === dept.id && b.created_at && b.created_at.slice(0, 10) === date);
        bases.forEach(b => {
            db.update('dept_bases', x => x.id === b.id, { enabled: enabled ? 1 : 0 });
            count++;
        });
    });
    res.json({ ok: true, toggled: count, enabled });
});

// Return all no_answer leads for bases of a specific day
app.post('/api/admin/inn-day/return-no-answer', requireAdmin, (req, res) => {
    const { date } = req.body;
    const depts = db.findAll('departments');
    let count = 0;
    depts.forEach(dept => {
        const bases = db.findAll('dept_bases', b => b.department_id === dept.id && b.created_at && b.created_at.slice(0, 10) === date);
        bases.forEach(base => {
            const leads = db.findAll('dept_leads', l => l.base_id === base.id && l.status === 'no_answer');
            leads.forEach(lead => {
                db.update('dept_leads', l => l.id === lead.id, { status: 'new', assigned_to: null, assigned_at: null });
                count++;
            });
        });
    });
    res.json({ ok: true, reset: count });
});

// Toggle fresh-first priority for INN
app.post('/api/admin/inn-fresh-priority', requireAdmin, (req, res) => {
    const { enabled } = req.body;
    db.setSetting('fresh_first_inn', enabled ? '1' : '0');
    res.json({ ok: true, enabled });
});

// ============ ACTIVITY FEED ============
app.get('/api/admin/activity-feed', requireAdmin, (req, res) => {
    // Last 200 dept_lead_actions + lead_actions
    const deptActions = db.findAll('dept_lead_actions').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200);
    const svoActions = db.findAll('lead_actions').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200);

    // Map dept actions
    const deptEvents = deptActions.map(a => {
        const user = db.findOne('dept_users', u => u.id === a.user_id);
        const lead = db.findOne('dept_leads', l => l.id === a.lead_id);
        return {
            time: a.created_at, type: 'inn', action: a.action_type,
            user_name: user ? user.display_name : '?',
            lead_name: lead ? (lead.fio || lead.company_name || '') : '',
            base_name: lead && lead.base_id ? (db.findOne('dept_bases', b => b.id === lead.base_id) || {}).name || '' : '',
            comment: a.comment || ''
        };
    });

    // Map SVO actions
    const svoEvents = svoActions.map(a => {
        const user = db.findOne('users', u => u.id === a.user_id);
        const lead = db.findOne('leads', l => l.id === a.lead_id);
        return {
            time: a.created_at, type: 'svo', action: a.action_type,
            user_name: user ? user.display_name : '?',
            lead_name: lead ? (lead.fio || lead.deceased_name || '') : '',
            base_name: lead && lead.base_id ? (db.findOne('bases', b => b.id === lead.base_id) || {}).name || '' : '',
            comment: a.comment || ''
        };
    });

    // Merge + sort by time desc
    const all = [...deptEvents, ...svoEvents].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 200);

    // Completed bases (progress >= 100% or 0 new)
    const completedBases = [];
    const depts = db.findAll('departments');
    depts.forEach(dept => {
        db.findAll('dept_bases', b => b.department_id === dept.id).forEach(base => {
            const leads = db.findAll('dept_leads', l => l.base_id === base.id);
            const total = leads.length;
            const remaining = leads.filter(l => l.status === 'new').length;
            const passed = leads.filter(l => l.status === 'passed').length;
            const na = leads.filter(l => l.status === 'no_answer').length;
            if (total > 0 && remaining === 0) {
                completedBases.push({ name: base.name, total, passed, no_answer: na, date: base.created_at });
            }
        });
    });
    completedBases.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ events: all, completedBases });
});

// Get ALL INN bases across all departments with analytics
app.get('/api/admin/inn-bases', requireAdmin, (req, res) => {
    const depts = db.findAll('departments');
    const allBases = [];
    const archivedBases = [];

    depts.forEach(dept => {
        const bases = db.findAll('dept_bases', b => b.department_id === dept.id);
        const deptUsers = db.findAll('dept_users', u => u.department_id === dept.id);

        bases.forEach(base => {
            const leads = db.findAll('dept_leads', l => l.base_id === base.id);
            const total = leads.length;
            const stats = { new: 0, no_answer: 0, callback: 0, passed: 0, docs: 0, skipped: 0, talked: 0, other_person: 0, inn_called: 0 };
            leads.forEach(l => { if (stats[l.status] !== undefined) stats[l.status]++; });

            const processed = total - stats.new;
            const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
            const innCalledPct = total > 0 ? Math.round((stats.inn_called / total) * 100) : 0;
            const passedPct = total > 0 ? Math.round((stats.passed / total) * 100) : 0;
            const passRating = processed > 0 ? Math.round((stats.passed / processed) * 100) : 0;

            // Get assigned workers (handle both raw array and JSON string)
            let assignedWorkers = [];
            try {
                const _raw = base.assigned_workers;
                if (Array.isArray(_raw)) assignedWorkers = _raw;
                else if (typeof _raw === 'string' && _raw) assignedWorkers = JSON.parse(_raw);
            } catch(e) {}

            const workerNames = assignedWorkers.length > 0
                ? assignedWorkers.map(wid => {
                    const u = deptUsers.find(u => u.id === wid);
                    return u ? u.display_name : '?';
                })
                : [];

            const baseData = {
                id: base.id,
                name: base.name,
                department_id: dept.id,
                department_name: dept.name,
                enabled: base.enabled,
                total,
                stats,
                processed,
                progress,
                inn_called_pct: innCalledPct,
                inn_called_count: stats.inn_called,
                passed_pct: passedPct,
                pass_rating: passRating,
                assigned_workers: assignedWorkers,
                worker_names: workerNames,
                created_at: base.created_at,
                is_archived: progress >= 90 && total > 0
            };

            if (baseData.is_archived) {
                archivedBases.push(baseData);
            } else {
                allBases.push(baseData);
            }
        });
    });

    // Sort: active bases by inn_called_pct desc, then by progress
    allBases.sort((a, b) => b.inn_called_pct - a.inn_called_pct || b.progress - a.progress);
    archivedBases.sort((a, b) => b.progress - a.progress);

    // Get all dept workers for assignment UI
    const allWorkers = [];
    depts.forEach(dept => {
        const users = db.findAll('dept_users', u => u.department_id === dept.id);
        users.forEach(u => {
            allWorkers.push({ id: u.id, name: u.display_name, department_id: dept.id, department_name: dept.name });
        });
    });

    // Summary
    const totalBases = allBases.length + archivedBases.length;
    const enabledBases = [...allBases, ...archivedBases].filter(b => b.enabled).length;
    const totalLeads = [...allBases, ...archivedBases].reduce((s, b) => s + b.total, 0);
    const totalInnCalled = [...allBases, ...archivedBases].reduce((s, b) => s + b.inn_called_count, 0);
    const totalPassed = [...allBases, ...archivedBases].reduce((s, b) => s + b.stats.passed, 0);
    const totalRemaining = [...allBases, ...archivedBases].reduce((s, b) => s + (b.stats.new || 0), 0);
    const totalNoAnswer = [...allBases, ...archivedBases].reduce((s, b) => s + (b.stats.no_answer || 0), 0);

    res.json({
        bases: allBases,
        archived: archivedBases,
        workers: allWorkers,
        summary: { totalBases, enabledBases, totalLeads, totalInnCalled, totalPassed, totalRemaining, totalNoAnswer }
    });
});

// Return ALL no_answer leads across ALL INN bases back to 'new'
app.post('/api/admin/inn-bases/return-all-no-answer', requireAdmin, (req, res) => {
    const allDeptLeads = db.findAll('dept_leads', l => l.status === 'no_answer');
    let count = 0;
    allDeptLeads.forEach(lead => {
        db.update('dept_leads', l => l.id === lead.id, { status: 'new', assigned_to: null, assigned_at: null });
        count++;
    });
    res.json({ ok: true, reset: count });
});

// Bulk toggle ALL INN bases (enable or disable)
app.post('/api/admin/inn-bases/toggle-all', requireAdmin, (req, res) => {
    const { enabled, department_id } = req.body; // enabled: 1 or 0
    let bases;
    if (department_id) {
        bases = db.findAll('dept_bases', b => b.department_id === parseInt(department_id));
    } else {
        bases = db.findAll('dept_bases');
    }
    let count = 0;
    bases.forEach(b => {
        db.update('dept_bases', base => base.id === b.id, { enabled: enabled ? 1 : 0 });
        count++;
    });
    console.log(`INN Bases: bulk toggle ${enabled ? 'ENABLED' : 'DISABLED'} — ${count} bases`);
    res.json({ ok: true, toggled: count });
});

// Enable ONLY specific base IDs (disable all others)
app.post('/api/admin/inn-bases/enable-only', requireAdmin, (req, res) => {
    const { base_ids } = req.body; // array of base IDs to enable
    if (!Array.isArray(base_ids)) return res.status(400).json({ error: 'base_ids required' });
    const allBases = db.findAll('dept_bases');
    let enabled = 0, disabled = 0;
    allBases.forEach(b => {
        if (base_ids.includes(b.id)) {
            db.update('dept_bases', x => x.id === b.id, { enabled: 1 });
            enabled++;
        } else {
            db.update('dept_bases', x => x.id === b.id, { enabled: 0 });
            disabled++;
        }
    });
    console.log(`INN Bases: enable-only — enabled ${enabled}, disabled ${disabled}`);
    res.json({ ok: true, enabled, disabled });
});

// Assign base exclusively to specific worker(s) — "дать звонить только"
app.post('/api/admin/inn-bases/:id/assign-only', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const { worker_ids } = req.body; // array of user IDs, empty = all workers
    db.update('dept_bases', b => b.id === id, { assigned_workers: JSON.stringify(worker_ids || []) });
    const names = (worker_ids || []).map(wid => {
        const u = db.findOne('dept_users', u => u.id === wid);
        return u ? u.display_name : '?';
    });
    console.log(`INN Base ${id} "${base.name}" assigned to: ${names.length ? names.join(', ') : 'ALL workers'}`);
    res.json({ ok: true });
});

// Export INN base as CSV
app.get('/api/admin/inn-bases/:id/export', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const leads = db.findAll('dept_leads', l => l.base_id === id);
    const dept = db.findOne('departments', d => d.id === base.department_id);

    // BOM for Excel UTF-8
    let csv = '\uFEFF';
    csv += 'ID;ФИО;Телефон;ИНН;Компания;Должность;Доход;Адрес;Статус;Дата создания;Обработал\n';
    leads.forEach(l => {
        const worker = l.processed_by ? db.findOne('dept_users', u => u.id === l.processed_by) : null;
        csv += [
            l.id,
            (l.full_name || l.fio || '').replace(/;/g, ','),
            (l.phone || '').replace(/;/g, ','),
            (l.inn || '').replace(/;/g, ','),
            (l.company_name || l.company || '').replace(/;/g, ','),
            (l.position || '').replace(/;/g, ','),
            (l.income || '').toString().replace(/;/g, ','),
            (l.address || '').replace(/;/g, ','),
            l.status || 'new',
            l.created_at || '',
            worker ? worker.display_name : ''
        ].join(';') + '\n';
    });

    const filename = `INN_${(base.name || 'base').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
});

// Delete INN base (with optional export first)
app.delete('/api/admin/inn-bases/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const leadCount = db.findAll('dept_leads', l => l.base_id === id).length;
    // Delete all leads in the base
    db.delete('dept_leads', l => l.base_id === id);
    // Delete the base itself
    db.delete('dept_bases', b => b.id === id);
    console.log(`[INN-BASE] DELETED base "${base.name}" (${leadCount} leads)`);
    res.json({ ok: true, deleted_leads: leadCount, base_name: base.name });
});

// Export + Delete INN base (returns JSON with lead data then deletes)
app.post('/api/admin/inn-bases/:id/export-delete', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const base = db.findOne('dept_bases', b => b.id === id);
    if (!base) return res.status(404).json({ error: 'База не найдена' });
    const leads = db.findAll('dept_leads', l => l.base_id === id);

    // Build CSV content
    let csv = '\uFEFF';
    csv += 'ID;ФИО;Телефон;ИНН;Компания;Должность;Доход;Адрес;Статус;Дата создания;Обработал\n';
    leads.forEach(l => {
        const worker = l.processed_by ? db.findOne('dept_users', u => u.id === l.processed_by) : null;
        csv += [
            l.id,
            (l.full_name || l.fio || '').replace(/;/g, ','),
            (l.phone || '').replace(/;/g, ','),
            (l.inn || '').replace(/;/g, ','),
            (l.company_name || l.company || '').replace(/;/g, ','),
            (l.position || '').replace(/;/g, ','),
            (l.income || '').toString().replace(/;/g, ','),
            (l.address || '').replace(/;/g, ','),
            l.status || 'new',
            l.created_at || '',
            worker ? worker.display_name : ''
        ].join(';') + '\n';
    });

    // Delete all leads and base
    db.delete('dept_leads', l => l.base_id === id);
    db.delete('dept_bases', b => b.id === id);
    console.log(`[INN-BASE] EXPORT+DELETE base "${base.name}" (${leads.length} leads)`);

    res.json({ ok: true, csv, base_name: base.name, deleted_leads: leads.length });
});

// ===== ADMIN MESSAGING — "Написать ХОЛОДКЕ" =====
// Send message to all or specific user
app.post('/api/admin/send-message', requireAdmin, (req, res) => {
    const { text, target_user_id } = req.body; // target_user_id = null means ALL
    if (!text || !text.trim()) return res.status(400).json({ error: 'Пустое сообщение' });

    const sender = db.findOne('users', u => u.id === req.session.userId);
    db.insert('admin_messages', {
        text: text.trim(),
        target_user_id: target_user_id || null, // null = broadcast to all
        sender_id: req.session.userId,
        sender_name: sender ? sender.display_name : 'Админ',
        read_by: JSON.stringify([]),
        created_at: new Date().toISOString()
    });

    const target = target_user_id ? db.findOne('users', u => u.id === target_user_id) : null;
    console.log(`[MSG] Admin sent message to ${target ? target.display_name : 'ALL'}: "${text.trim().substring(0, 50)}..."`);
    res.json({ ok: true });
});

// Get unread messages for current user
app.get('/api/my-messages', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const messages = db.findAll('admin_messages', m => {
        if (m.target_user_id && m.target_user_id !== userId) return false;
        let readBy = [];
        try { readBy = JSON.parse(m.read_by || '[]'); } catch(e) {}
        return !readBy.includes(userId);
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(messages);
});

// Mark message as read
app.post('/api/messages/:id/read', requireAuth, (req, res) => {
    const msgId = parseInt(req.params.id);
    const userId = req.session.userId;
    const msg = db.findOne('admin_messages', m => m.id === msgId);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    let readBy = [];
    try { readBy = JSON.parse(msg.read_by || '[]'); } catch(e) {}
    if (!readBy.includes(userId)) {
        readBy.push(userId);
        db.update('admin_messages', m => m.id === msgId, { read_by: JSON.stringify(readBy) });
    }
    res.json({ ok: true });
});

// Get all messages (admin view)
app.get('/api/admin/messages', requireAdmin, (req, res) => {
    const messages = db.findAll('admin_messages')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 50);
    res.json(messages);
});

// Delete message (admin)
app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
    const msgId = parseInt(req.params.id);
    db.delete('admin_messages', m => m.id === msgId);
    res.json({ ok: true });
});

// ===== ADMIN PUSH NOTIFICATIONS — event queue =====
const _adminEvents = []; // In-memory event queue (last 100 max)
const MAX_ADMIN_EVENTS = 100;

function pushAdminEvent(type, text, details) {
    _adminEvents.push({
        id: Date.now() + Math.random(),
        type: type, // 'pass', 'delete', 'base_done'
        text: text,
        details: details || '',
        time: new Date().toISOString()
    });
    if (_adminEvents.length > MAX_ADMIN_EVENTS) _adminEvents.shift();
}

// API: Get events since timestamp
app.get('/api/admin/events', requireAdmin, (req, res) => {
    const since = req.query.since || '';
    let events;
    if (since) {
        events = _adminEvents.filter(e => e.time > since);
    } else {
        events = _adminEvents.slice(-20); // Last 20 on first load
    }
    res.json({ events });
});

// API: Get event history (all in memory)
app.get('/api/admin/events/history', requireAdmin, (req, res) => {
    res.json({ events: [..._adminEvents].reverse() });
});

// Hook into lead actions to generate events
// We need to find where 'передал' actions happen and add pushAdminEvent calls
// For SVO leads:
const _origLeadAction = app._router;

// Check base completion helper
function _checkBaseCompletion(baseId, baseType) {
    if (!baseId) return;
    if (baseType === 'svo') {
        const base = db.findOne('bases', b => b.id === baseId);
        if (!base) return;
        const remaining = db.count('leads', l => l.base_id === baseId && l.status === 'new');
        if (remaining === 0) {
            const total = db.count('leads', l => l.base_id === baseId);
            pushAdminEvent('base_done', `📦 База "${base.name}" полностью прозвонена!`, `Всего: ${total} лидов`);
        }
    } else {
        const base = db.findOne('dept_bases', b => b.id === baseId);
        if (!base) return;
        const remaining = db.count('dept_leads', l => l.base_id === baseId && l.status === 'new');
        if (remaining === 0) {
            const total = db.count('dept_leads', l => l.base_id === baseId);
            pushAdminEvent('base_done', `📦 ИНН База "${base.name}" полностью прозвонена!`, `Всего: ${total} лидов`);
        }
    }
}

// Global error handler
app.use((err, req, res, next) => {
    console.error('[EXPRESS ERROR]', req.method, req.url, err.status || 500, err.message);
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
    console.log(`🚀 CRM Server running at http://localhost:${PORT}`);
    console.log(`   Admin: admin / admin123`);
});
