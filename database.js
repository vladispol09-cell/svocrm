const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data');
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH);

// Safe JSON file-based database with atomic writes and backups
class JsonDB {
  constructor() {
    this.tables = ['users', 'leads', 'lead_actions', 'callbacks', 'bases', 'settings', 'documents', 'departments', 'dept_users', 'dept_leads', 'dept_bases', 'dept_lead_actions', 'pass_records', 'autodial_queue', 'admin_messages'];
    this.data = {};
    this.counters = {};
    this._dirty = {};
    this._saveTimers = {};
    this.SAVE_DELAY = 2000;
    this._batchMode = false;
    this.load();
    this.seed();
  }

  getFilePath(table) {
    return path.join(DB_PATH, `${table}.json`);
  }

  load() {
    for (const table of this.tables) {
      const fp = this.getFilePath(table);
      if (fs.existsSync(fp)) {
        try {
          const content = fs.readFileSync(fp, 'utf-8');
          if (!content || content.trim().length === 0) {
            // File is empty, try backup
            const backup = fp + '.bak';
            if (fs.existsSync(backup)) {
              console.log(`[DB] Table ${table} is empty, restoring from backup...`);
              const backupContent = fs.readFileSync(backup, 'utf-8');
              this.data[table] = JSON.parse(backupContent);
            } else {
              this.data[table] = [];
            }
          } else {
            this.data[table] = JSON.parse(content);
          }
        } catch (e) {
          console.error(`[DB] Error loading table ${table}:`, e.message);
          // Try backup on parse error
          const backup = fp + '.bak';
          if (fs.existsSync(backup)) {
            try {
              console.log(`[DB] Trying backup for ${table}...`);
              this.data[table] = JSON.parse(fs.readFileSync(backup, 'utf-8'));
              console.log(`[DB] Restored ${table} from backup (${this.data[table].length} records)`);
            } catch(e2) {
              console.error(`[DB] Backup also failed for ${table}`);
              this.data[table] = [];
            }
          } else {
            this.data[table] = [];
          }
        }
      } else {
        this.data[table] = [];
      }
      const maxId = this.data[table].reduce((max, r) => Math.max(max, r.id || 0), 0);
      this.counters[table] = maxId + 1;
    }
  }

  // SAFE atomic write: write to .tmp, then rename (prevents corruption)
  _atomicSaveSync(table) {
    const fp = this.getFilePath(table);
    const tmp = fp + '.tmp';
    const bak = fp + '.bak';
    const jsonData = JSON.stringify(this.data[table]);
    
    // 1. Write to temp file
    fs.writeFileSync(tmp, jsonData, 'utf-8');
    
    // 2. Backup current file
    if (fs.existsSync(fp)) {
      try { fs.copyFileSync(fp, bak); } catch(e) {}
    }
    
    // 3. Rename temp to actual (atomic on most filesystems)
    fs.renameSync(tmp, fp);
  }

  // Debounced save — schedules a safe sync write
  _scheduleSave(table) {
    this._dirty[table] = true;
    if (this._batchMode) return; // Skip timer during batch operations
    if (this._saveTimers[table]) return;
    this._saveTimers[table] = setTimeout(() => {
      this._saveTimers[table] = null;
      if (this._dirty[table]) {
        this._dirty[table] = false;
        try {
          this._atomicSaveSync(table);
        } catch(e) {
          console.error(`[DB] Save error for ${table}:`, e.message);
        }
      }
    }, this.SAVE_DELAY);
  }

  // Batch mode: defer all saves until endBatch()
  beginBatch() { this._batchMode = true; }
  endBatch() {
    this._batchMode = false;
    for (const table of Object.keys(this._dirty)) {
      if (this._dirty[table]) {
        this._dirty[table] = false;
        try { this._atomicSaveSync(table); } catch(e) { console.error(`[DB] Batch save error:`, e.message); }
      }
    }
  }

  save(table) {
    this._scheduleSave(table);
  }

  // Force immediate save (for critical operations)
  saveNow(table) {
    if (this._saveTimers[table]) {
      clearTimeout(this._saveTimers[table]);
      this._saveTimers[table] = null;
    }
    this._dirty[table] = false;
    this._atomicSaveSync(table);
  }

  seed() {
    const adminExists = this.data.users.find(u => u.username === 'admin');
    if (!adminExists) {
      this.insert('users', {
        username: 'admin',
        password_hash: bcrypt.hashSync('admin123', 10),
        display_name: 'Администратор',
        role: 'admin',
        created_at: new Date().toISOString()
      });
    }
  }

  insert(table, record) {
    const id = this.counters[table]++;
    const row = { id, ...record };
    this.data[table].push(row);
    this._scheduleSave(table);
    return { lastInsertRowid: id };
  }

  insertMany(table, records) {
    const ids = [];
    for (const record of records) {
      const id = this.counters[table]++;
      this.data[table].push({ id, ...record });
      ids.push(id);
    }
    this._scheduleSave(table);
    return ids;
  }

  findAll(table, filter) {
    if (!this.data[table]) return [];
    if (!filter) return [...this.data[table]];
    return this.data[table].filter(filter);
  }

  findOne(table, filter) {
    if (!this.data[table]) return null;
    return this.data[table].find(filter) || null;
  }

  update(table, filter, updates) {
    if (!this.data[table]) return 0;
    let updated = 0;
    this.data[table] = this.data[table].map(row => {
      if (filter(row)) {
        updated++;
        return { ...row, ...updates };
      }
      return row;
    });
    if (updated > 0) this._scheduleSave(table);
    return updated;
  }

  updateMany(table, filter, updateFn) {
    if (!this.data[table]) return 0;
    let updated = 0;
    this.data[table] = this.data[table].map(row => {
      if (filter(row)) {
        updated++;
        return { ...row, ...updateFn(row) };
      }
      return row;
    });
    if (updated > 0) this._scheduleSave(table);
    return updated;
  }

  delete(table, filter) {
    if (!this.data[table]) return 0;
    const before = this.data[table].length;
    this.data[table] = this.data[table].filter(row => !filter(row));
    if (this.data[table].length !== before) this._scheduleSave(table);
    return before - this.data[table].length;
  }

  count(table, filter) {
    if (!this.data[table]) return 0;
    if (!filter) return this.data[table].length;
    return this.data[table].filter(filter).length;
  }

  getSetting(key) {
    const s = this.data.settings.find(r => r.key === key);
    return s ? s.value : null;
  }

  setSetting(key, value) {
    const existing = this.data.settings.find(r => r.key === key);
    if (existing) {
      existing.value = value;
    } else {
      this.data.settings.push({ id: this.counters.settings++, key, value });
    }
    this._scheduleSave('settings');
  }
}

const dbInstance = new JsonDB();

// Flush all dirty tables on shutdown
process.on('exit', () => {
  for (const table of dbInstance.tables) {
    if (dbInstance._dirty[table]) {
      try { dbInstance._atomicSaveSync(table); } catch(e) {}
    }
  }
});
process.on('SIGINT', () => { process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });

module.exports = dbInstance;
