const { getStore } = require('@netlify/blobs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { Resend } = require('resend');

const BLOB_STORE = 'nexus-data';
const JWT_SECRET = process.env.JWT_SECRET || 'nexus-dev-secret-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:3000';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

async function getData() {
  const store = getStore({ name: BLOB_STORE, consistency: 'strong' });
  const raw = await store.get('db');
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (!data.magicTokens) data.magicTokens = [];
  if (!data.resetTokens) data.resetTokens = [];
  if (!data.nextUserId) data.nextUserId = Math.max(...(data.users || []).map(u => u.id), 0) + 1;
  return data;
}

async function setData(data) {
  const store = getStore({ name: BLOB_STORE, consistency: 'strong' });
  await store.set('db', JSON.stringify(data));
}

function json(body, status = 200, headers = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers },
    body: JSON.stringify(body)
  };
}

function getUserIdFromToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch (_) {
    return null;
  }
}

exports.handler = async (event) => {
  const path = '/' + (event.queryStringParameters?.path || '').replace(/^\//, '');
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};
  let body = {};
  try {
    if (event.body) body = JSON.parse(event.body);
  } catch (_) {}

  const userId = getUserIdFromToken(event);

  try {
    const data = await getData();
    if (!data) return json({ error: 'Database not initialized' }, 500);

    // GET /me — current user from JWT
    if ((path === '/me' || path === '/auth/me') && method === 'GET') {
      if (!userId) return json({ user: null });
      const user = data.users.find(u => u.id === userId);
      if (!user) return json({ user: null });
      if (user.is_blocked) return json({ user: null });
      const adminIds = (process.env.ADMIN_USER_IDS || '1').split(',').map(s => parseInt(s.trim())).filter(Boolean);
      const is_admin = adminIds.includes(userId) || !!user.is_admin;
      const { password_hash, is_blocked, ...safe } = user;
      return json({ user: { ...safe, is_admin } });
    }

    // POST /signup — email OR phone + optional password
    if ((path === '/signup' || path === '/auth/signup') && method === 'POST') {
      const normalizePhone = (p) => { const d = (p || '').replace(/\D/g, ''); return d.length >= 10 ? d : null; };
      const isEmail = (v) => v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

      const { email, phone, password, username, name, identifier } = body;
      let emailVal = (email || identifier || '').trim().toLowerCase();
      let phoneVal = normalizePhone(phone || identifier || '');

      if (!emailVal && !phoneVal) return json({ error: 'Email or phone number required' }, 400);
      if (emailVal && !isEmail(emailVal)) emailVal = '';
      if (!emailVal && !phoneVal) return json({ error: 'Enter a valid email or phone number' }, 400);

      const baseU = username ? username.trim().toLowerCase().replace(/\W/g, '').slice(0, 20) : (emailVal ? emailVal.split('@')[0].slice(0, 20).replace(/\W/g, '') : 'u' + (phoneVal || '').slice(-6));
      let un = (baseU || 'user').slice(0, 20);
      let i = 0;
      while (data.users.some(x => (x.username || '').toLowerCase() === un)) un = (baseU || 'user').slice(0, 18) + (++i);

      if (emailVal) {
        const ex = data.users.find(x => (x.email || '').toLowerCase() === emailVal);
        if (ex) return json({ error: 'Email already registered' }, 400);
      }
      if (phoneVal) {
        const ex = data.users.find(x => (x.phone || '') === phoneVal);
        if (ex) return json({ error: 'Phone number already registered' }, 400);
      }
      if (phoneVal && !password) return json({ error: 'Password required for phone signup (min 6 chars)' }, 400);
      if (password && password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

      const newUser = {
        id: data.nextUserId++,
        username: un,
        name: (name || '').trim() || un,
        email: emailVal || null,
        phone: phoneVal || null,
        password_hash: password ? bcrypt.hashSync(password, 10) : null,
        provider: null,
        provider_id: null,
        bio: null,
        avatar: null
      };
      data.users.push(newUser);
      await setData(data);
      const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
      const { password_hash, ...safe } = newUser;
      return json({ user: safe, token });
    }

    // POST /login — email OR phone + password
    if ((path === '/login' || path === '/auth/login') && method === 'POST') {
      const normalizePhone = (p) => { const d = (p || '').replace(/\D/g, ''); return d.length >= 10 ? d : null; };
      const isEmail = (v) => v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

      const { email, phone, password, identifier } = body;
      const id = identifier || email || phone;
      if (!id || !password) return json({ error: 'Email or phone and password required' }, 400);

      let user;
      if (isEmail(id)) {
        user = data.users.find(u => (u.email || '').toLowerCase() === id.toLowerCase());
      } else {
        const ph = normalizePhone(id);
        user = ph ? data.users.find(u => (u.phone || '') === ph) : null;
      }
      if (!user || !user.password_hash) return json({ error: 'Invalid email/phone or password' }, 401);
      if (user.is_blocked) return json({ error: 'Account has been suspended' }, 403);
      if (!bcrypt.compareSync(password, user.password_hash)) return json({ error: 'Invalid email/phone or password' }, 401);
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      const { password_hash, is_blocked, ...safe } = user;
      return json({ user: safe, token });
    }

    // POST /magic-link — send magic link email
    if ((path === '/magic-link' || path === '/auth/magic-link') && method === 'POST') {
      const { email } = body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Valid email required' }, 400);

      let user = data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
      if (!user) {
        const u = email.split('@')[0].toLowerCase().slice(0, 20);
        const base = u;
        let i = 0;
        while (data.users.some(x => (x.username || '').toLowerCase() === u)) {
          u = base + (++i);
        }
        user = {
          id: data.nextUserId++,
          username: u,
          name: u,
          email: email.toLowerCase(),
          password_hash: null,
          provider: null,
          provider_id: null,
          bio: null,
          avatar: null
        };
        data.users.push(user);
      }

      const token = require('crypto').randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      data.magicTokens = (data.magicTokens || []).filter(t => new Date(t.expires) > new Date());
      data.magicTokens.push({ token, userId: user.id, email: email.toLowerCase(), expires });
      await setData(data);

      const verifyUrl = `${SITE_URL.replace(/\/$/, '')}/?magic=${token}`;
      if (resend) {
        await resend.emails.send({
          from: 'Nexus <onboarding@resend.dev>',
          to: email,
          subject: 'Sign in to Nexus',
          html: `Click to sign in: <a href="${verifyUrl}">${verifyUrl}</a>. Link expires in 15 minutes.`
        });
        return json({ sent: true });
      }
      return json({ sent: false, verifyUrl }); // dev fallback
    }

    // GET /magic-link/verify — verify token from email link
    if ((path === '/magic-link/verify' || path === '/auth/magic-link/verify') && method === 'GET') {
      const token = qs.token || body.token;
      if (!token) return json({ error: 'Token required' }, 400);
      const mt = (data.magicTokens || []).find(t => t.token === token);
      if (!mt || new Date(mt.expires) < new Date()) return json({ error: 'Link expired or invalid' }, 400);
      data.magicTokens = data.magicTokens.filter(t => t.token !== token);
      await setData(data);
      const user = data.users.find(u => u.id === mt.userId);
      if (!user) return json({ error: 'User not found' }, 404);
      if (user.is_blocked) return json({ error: 'Account has been suspended' }, 403);
      const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      const { password_hash, is_blocked, ...safe } = user;
      return json({ user: safe, token: jwtToken });
    }

    // POST /google — verify Google ID token
    if ((path === '/google' || path === '/auth/google') && method === 'POST') {
      const { idToken } = body;
      if (!idToken) return json({ error: 'Google token required' }, 400);
      if (!googleClient) return json({ error: 'Google sign-in not configured (GOOGLE_CLIENT_ID)' }, 503);
      let ticket;
      try {
        ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
      } catch (e) {
        return json({ error: 'Invalid Google token' }, 401);
      }
      const payload = ticket.getPayload();
      const email = payload.email;
      const sub = payload.sub;
      let user = data.users.find(u => u.provider === 'google' && u.provider_id === sub);
      if (!user) {
        user = data.users.find(u => (u.email || '').toLowerCase() === (email || '').toLowerCase());
        if (user) {
          user.provider = 'google';
          user.provider_id = sub;
        } else {
          const u = (email || sub).split('@')[0].toLowerCase().replace(/\W/g, '').slice(0, 20) || 'user';
          let un = u;
          let i = 0;
          while (data.users.some(x => (x.username || '').toLowerCase() === un)) un = u + (++i);
          user = {
            id: data.nextUserId++,
            username: un,
            name: payload.name || un,
            email: email || null,
            password_hash: null,
            provider: 'google',
            provider_id: sub,
            bio: null,
            avatar: payload.picture || null
          };
          data.users.push(user);
        }
        await setData(data);
      }
      if (user.is_blocked) return json({ error: 'Account has been suspended' }, 403);
      const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      const { password_hash, is_blocked, ...safe } = user;
      return json({ user: safe, token: jwtToken });
    }

    // POST /forgot-password — send password reset email
    if ((path === '/forgot-password' || path === '/auth/forgot-password') && method === 'POST') {
      const { email } = body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Valid email required' }, 400);
      const user = data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
      if (!user || !user.password_hash) return json({ sent: true }); // Don't reveal if email exists
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      data.resetTokens = (data.resetTokens || []).filter(t => new Date(t.expires) > new Date());
      data.resetTokens.push({ token: resetToken, userId: user.id, expires });
      await setData(data);
      const resetUrl = `${SITE_URL.replace(/\/$/, '')}/?reset=${resetToken}`;
      if (resend) {
        await resend.emails.send({
          from: 'Nexus <onboarding@resend.dev>',
          to: email,
          subject: 'Reset your Nexus password',
          html: `Click to reset your password: <a href="${resetUrl}">${resetUrl}</a>. Link expires in 1 hour.`
        });
        return json({ sent: true });
      }
      return json({ sent: false, resetUrl });
    }

    // POST /reset-password — set new password with token
    if ((path === '/reset-password' || path === '/auth/reset-password') && method === 'POST') {
      const { token: resetToken, password } = body;
      if (!resetToken || !password || password.length < 6) return json({ error: 'Token and password (min 6 chars) required' }, 400);
      const rt = (data.resetTokens || []).find(t => t.token === resetToken);
      if (!rt || new Date(rt.expires) < new Date()) return json({ error: 'Link expired or invalid' }, 400);
      data.resetTokens = data.resetTokens.filter(t => t.token !== resetToken);
      const user = data.users.find(u => u.id === rt.userId);
      if (!user) return json({ error: 'User not found' }, 404);
      user.password_hash = bcrypt.hashSync(password, 10);
      await setData(data);
      const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      const { password_hash, ...safe } = user;
      return json({ user: safe, token: jwtToken });
    }

    // GET /config — public config (e.g. Google Client ID for frontend)
    if ((path === '/config' || path === '/auth/config') && method === 'GET') {
      return json({ googleClientId: GOOGLE_CLIENT_ID || '' });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};
