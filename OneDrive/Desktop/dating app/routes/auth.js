const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'nexus-dev-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

function getDbInstance(req) {
  return req.app.locals.db;
}

function getUserId(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch (_) {
    return null;
  }
}

function isAdmin(db, userId) {
  const adminIds = (process.env.ADMIN_USER_IDS || '1').split(',').map(s => parseInt(s.trim())).filter(Boolean);
  if (adminIds.includes(userId)) return true;
  const u = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
  return !!(u && u.is_admin);
}

router.get('/me', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ user: null });
    const db = getDbInstance(req);
    const user = db.prepare('SELECT id, name, username, email, avatar, bio, provider FROM users WHERE id = ?').get(userId);
    if (!user) return res.json({ user: null });
    const blocked = db.prepare('SELECT is_blocked FROM users WHERE id = ?').get(userId);
    if (blocked && blocked.is_blocked) return res.json({ user: null });
    res.json({ user: { ...user, is_admin: isAdmin(db, userId) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

router.post('/forgot-password', async (req, res) => {
  try {
    const db = getDbInstance(req);
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email.toLowerCase());
    if (!user || !user.password_hash) return res.json({ sent: true });
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reset_tokens (token, user_id, expires) VALUES (?, ?, ?)').run(resetToken, user.id, expires);
    const resetUrl = `${req.protocol}://${req.get('host')}/?reset=${resetToken}`;
    res.json({ sent: false, resetUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const db = getDbInstance(req);
    const { token: resetToken, password } = req.body;
    if (!resetToken || !password || password.length < 6) return res.status(400).json({ error: 'Token and password (min 6 chars) required' });
    const row = db.prepare('SELECT user_id, expires FROM reset_tokens WHERE token = ?').get(resetToken);
    if (!row || new Date(row.expires) < new Date()) return res.status(400).json({ error: 'Link expired or invalid' });
    db.prepare('DELETE FROM reset_tokens WHERE token = ?').run(resetToken);
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
    const user = db.prepare('SELECT id, name, username, email, avatar, bio FROM users WHERE id = ?').get(row.user_id);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function normalizePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

function isEmail(val) {
  return val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
}

router.post('/signup', async (req, res) => {
  try {
    const db = getDbInstance(req);
    const { email, phone, password, username, name, identifier } = req.body;

    let emailVal = (email || identifier || '').trim().toLowerCase();
    let phoneVal = normalizePhone(phone || identifier || '');

    if (!emailVal && !phoneVal) return res.status(400).json({ error: 'Email or phone number required' });
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) emailVal = '';
    if (!emailVal && !phoneVal) return res.status(400).json({ error: 'Enter a valid email or phone number' });

    const u = username ? username.trim().toLowerCase() : (emailVal ? emailVal.split('@')[0].slice(0, 20).replace(/\W/g, '') : 'u' + phoneVal.slice(-6));
    const baseUsername = u.length >= 3 ? u : (emailVal ? 'user' : 'u' + phoneVal.slice(-6));
    let un = baseUsername.replace(/\W/g, '').slice(0, 20) || 'user';
    let i = 0;
    while (db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(un)) un = (baseUsername.replace(/\W/g, '') || 'user').slice(0, 18) + (++i);

    if (emailVal && db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(emailVal)) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (phoneVal && db.prepare('SELECT id FROM users WHERE phone = ?').get(phoneVal)) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    if (phoneVal && !password) return res.status(400).json({ error: 'Password required for phone signup (min 6 chars)' });
    if (password && password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const nextId = db.prepare('SELECT COALESCE(MAX(id),0)+1 as n FROM users').get().n;
    const password_hash = password ? bcrypt.hashSync(password, 10) : null;
    const displayName = (name || '').trim() || un;
    db.prepare('INSERT INTO users (id, username, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nextId, un, displayName, emailVal || null, phoneVal || null, password_hash);

    const user = db.prepare('SELECT id, name, username, email, avatar, bio FROM users WHERE id = ?').get(nextId);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const db = getDbInstance(req);
    const { email, phone, password, identifier } = req.body;
    const id = identifier || email || phone;
    if (!id || !password) return res.status(400).json({ error: 'Email or phone and password required' });

    let user;
    if (isEmail(id)) {
      user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(id.toLowerCase());
    } else {
      const ph = normalizePhone(id);
      user = ph ? db.prepare('SELECT * FROM users WHERE phone = ?').get(ph) : null;
    }
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid email/phone or password' });
    if (user.is_blocked) return res.status(403).json({ error: 'Account has been suspended' });
    if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email/phone or password' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...safe } = user;
    res.json({ user: safe, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/magic-link', async (req, res) => {
  try {
    const db = getDbInstance(req);
    const { email } = req.body;
    const em = (email || '').trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ error: 'Valid email required' });

    let user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(em);
    if (!user) {
      const u = em.split('@')[0].toLowerCase().slice(0, 20).replace(/\W/g, '') || 'user';
      let un = u;
      let i = 0;
      while (db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(un)) un = u + (++i);
      const nextId = db.prepare('SELECT COALESCE(MAX(id),0)+1 as n FROM users').get().n;
      db.prepare('INSERT INTO users (id, username, name, email) VALUES (?, ?, ?, ?)')
        .run(nextId, un, un, em);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(nextId);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    try { db.prepare('CREATE TABLE IF NOT EXISTS magic_tokens (token TEXT PRIMARY KEY, user_id INTEGER, expires TEXT)').run(); } catch (_) {}
    db.prepare('INSERT INTO magic_tokens (token, user_id, expires) VALUES (?, ?, ?)').run(token, user.id, expires);

    const verifyUrl = `${req.protocol}://${req.get('host')}/?magic=${token}`;
    res.json({ sent: false, verifyUrl }); // No email in local dev
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/magic-link/verify', async (req, res) => {
  try {
    const db = getDbInstance(req);
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const row = db.prepare('SELECT user_id, expires FROM magic_tokens WHERE token = ?').get(token);
    if (!row || new Date(row.expires) < new Date()) return res.status(400).json({ error: 'Link expired or invalid' });
    db.prepare('DELETE FROM magic_tokens WHERE token = ?').run(token);
    const raw = db.prepare('SELECT id, name, username, email, avatar, bio, is_blocked FROM users WHERE id = ?').get(row.user_id);
    if (!raw) return res.status(404).json({ error: 'User not found' });
    if (raw.is_blocked) return res.status(403).json({ error: 'Account has been suspended' });
    const { is_blocked, ...user } = raw;
    const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token: jwtToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/google', async (req, res) => {
  try {
    const db = getDbInstance(req);
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Google token required' });
    if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in not configured' });
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const sub = payload.sub;
    const email = payload.email;

    let user = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?').get('google', sub);
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get((email || '').toLowerCase());
      if (user) {
        db.prepare('UPDATE users SET provider = ?, provider_id = ? WHERE id = ?').run('google', sub, user.id);
      } else {
        const u = (email || sub).split('@')[0].toLowerCase().replace(/\W/g, '').slice(0, 20) || 'user';
        let un = u;
        let i = 0;
        while (db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(un)) un = u + (++i);
        const nextId = db.prepare('SELECT COALESCE(MAX(id),0)+1 as n FROM users').get().n;
        try { db.prepare('ALTER TABLE users ADD COLUMN provider TEXT').run(); } catch (_) {}
        try { db.prepare('ALTER TABLE users ADD COLUMN provider_id TEXT').run(); } catch (_) {}
        db.prepare('INSERT INTO users (id, username, name, email, provider, provider_id, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(nextId, un, payload.name || un, email || null, 'google', sub, payload.picture || null);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(nextId);
      }
    }
    if (user.is_blocked) return res.status(403).json({ error: 'Account has been suspended' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, is_blocked, ...safe } = user;
    res.json({ user: safe, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
