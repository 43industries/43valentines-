require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { getDb } = require('./db');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nexus-dev-secret';

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);

async function rejectBlocked(req, res, next) {
  const userId = getAuthUserId(req);
  if (!userId) return next();
  const dbInstance = await db();
  const u = dbInstance.prepare('SELECT is_blocked FROM users WHERE id = ?').get(userId);
  if (u && u.is_blocked) return res.status(403).json({ error: 'Account has been suspended' });
  next();
}

function getAuthUserId(req) {
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

function isAdmin(dbInstance, userId) {
  if (!userId) return false;
  const adminIds = (process.env.ADMIN_USER_IDS || '1').split(',').map(s => parseInt(s.trim())).filter(Boolean);
  if (adminIds.includes(userId)) return true;
  const u = dbInstance.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
  return !!(u && u.is_admin);
}

function requireAdmin(req, res, next) {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  db().then(dbInstance => {
    if (!isAdmin(dbInstance, userId)) return res.status(403).json({ error: 'Admin access required' });
    req.adminUserId = userId;
    next();
  }).catch(err => next(err));
}

// Helper to get db (async)
async function db() {
  return getDb();
}

function notBlocked(u) {
  return !(u.is_blocked);
}

// === ALGORITHM HELPERS (blended OnlyFans + Tinder) ===
function getDataForAlgo(dbInstance) {
  const allUsers = dbInstance.prepare('SELECT * FROM users').all();
  const users = allUsers.filter(notBlocked);
  const blockedIds = new Set(allUsers.filter(u => u.is_blocked).map(u => u.id));
  const follows = [];
  try {
    const rows = dbInstance.prepare('SELECT follower_id as follower_id, following_id as following_id FROM follows').all();
    follows.push(...rows);
  } catch (_) {}
  const swipes = [];
  try {
    const rows = dbInstance.prepare('SELECT user_id, target_id, direction FROM swipes').all();
    swipes.push(...rows);
  } catch (_) {}
  let allPosts = [];
  try {
    allPosts = dbInstance.prepare('SELECT * FROM posts').all();
  } catch (_) {}
  const posts = allPosts.filter(p => !blockedIds.has(p.user_id));
  let likes = [];
  try {
    likes = dbInstance.prepare('SELECT post_id, user_id FROM likes').all();
  } catch (_) {}
  let comments = [];
  try {
    comments = dbInstance.prepare('SELECT post_id FROM comments').all();
  } catch (_) {}
  return { users, follows, swipes, posts, likes, comments };
}

function computeDiscoveryScore(targetUser, data, viewerId) {
  let score = 0;
  const followers = data.follows.filter(f => f.following_id === targetUser.id).length;
  const theirPosts = data.posts.filter(p => p.user_id === targetUser.id);
  const postIds = theirPosts.map(p => p.id);
  const engagement = data.likes.filter(l => postIds.includes(l.post_id)).length +
    data.comments.filter(c => postIds.includes(c.post_id)).length;
  score += (followers * 2 + Math.log1p(engagement)) * 0.35;
  const theyLikedYou = data.swipes.some(s => s.target_id === viewerId && s.user_id === targetUser.id && s.direction === 'like');
  if (theyLikedYou) score += 50;
  const youLiked = data.swipes.filter(s => s.user_id === viewerId && s.direction === 'like').map(s => s.target_id);
  const theyLiked = data.swipes.filter(s => s.user_id === targetUser.id && s.direction === 'like').map(s => s.target_id);
  const overlap = youLiked.filter(id => theyLiked.includes(id)).length;
  score += overlap * 8;
  const lastActivity = [...data.swipes.filter(s => s.user_id === targetUser.id), ...theirPosts]
    .map(x => x.created_at && new Date(x.created_at).getTime()).filter(Boolean);
  const maxActivity = lastActivity.length ? Math.max(...lastActivity) : 0;
  const hoursSince = (Date.now() - maxActivity) / 3600000;
  score += Math.max(0, 15 - hoursSince * 0.5);
  return score;
}

function requireAuth(req, res, next) {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  req.userId = userId;
  next();
}

// === API ROUTES ===
app.use('/api', (req, res, next) => {
  if (req.originalUrl.startsWith('/api/auth') || req.originalUrl.startsWith('/api/admin')) return next();
  requireAuth(req, res, () => {
    rejectBlocked(req, res, next).catch(next);
  });
});

app.get('/api/discovery', async (req, res) => {
  try {
    const currentUserId = req.userId;
    const dbInstance = await db();
    const data = getDataForAlgo(dbInstance);
    const swiped = data.swipes.filter(s => s.user_id === currentUserId).map(s => s.target_id);
    const candidates = data.users
      .filter(u => u.id !== currentUserId && !swiped.includes(u.id) && notBlocked(u))
      .map(u => ({ user: u, score: computeDiscoveryScore(u, data, currentUserId) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(x => ({ ...x.user, _score: Math.round(x.score) }));
    res.json(candidates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/swipe', async (req, res) => {
  try {
    const currentUserId = req.userId;
    const dbInstance = await db();
    const { targetId, direction } = req.body;
    if (!targetId || !['like', 'pass'].includes(direction)) return res.status(400).json({ error: 'Invalid swipe' });
    try {
      dbInstance.prepare('INSERT INTO swipes (user_id, target_id, direction) VALUES (?, ?, ?)').run(currentUserId, parseInt(targetId), direction);
    } catch (e) { /* already exists */ }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/matches', async (req, res) => {
  try {
    const currentUserId = parseInt(req.userId, 10);
    if (!Number.isFinite(currentUserId)) return res.status(401).json({ error: 'Invalid user' });
    const dbInstance = await db();
    const data = getDataForAlgo(dbInstance);
    const youLiked = data.swipes.filter(s => s.user_id === currentUserId && s.direction === 'like').map(s => s.target_id);
    const mutual = youLiked.filter(tid =>
      data.swipes.some(s => s.user_id === tid && s.target_id === currentUserId && s.direction === 'like')
    );
    const matches = mutual.map(id => data.users.find(u => u.id === id)).filter(Boolean);
    res.json(matches);
  } catch (err) {
    console.error('/api/matches', err);
    res.status(500).json({ error: err.message || 'Failed to load matches' });
  }
});

app.post('/api/follow', async (req, res) => {
  try {
    const currentUserId = req.userId;
    const dbInstance = await db();
    const targetId = parseInt(req.body.targetId);
    if (!targetId) return res.status(400).json({ error: 'Invalid target' });
    try {
      dbInstance.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(currentUserId, targetId);
    } catch (e) { /* exists */ }
    res.status(201).json({ following: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/feed', async (req, res) => {
  try {
    const currentUserId = req.userId;
    const dbInstance = await db();
    const mode = req.query.mode || 'for-you';
    let postIds;
    if (mode === 'following') {
      const data = getDataForAlgo(dbInstance);
      const following = data.follows.filter(f => f.follower_id === currentUserId).map(f => f.following_id);
      postIds = data.posts.filter(p => following.includes(p.user_id)).map(p => p.id);
    } else {
      const data = getDataForAlgo(dbInstance);
      const scored = data.posts.map(p => {
        let s = Math.max(0, 72 - (Date.now() - new Date(p.created_at).getTime()) / 3600000) * 0.5;
        const followers = data.follows.filter(f => f.following_id === p.user_id).length;
        s += Math.log1p(followers) * 5;
        const likes = data.likes.filter(l => l.post_id === p.id).length;
        const comments = data.comments.filter(c => c.post_id === p.id).length;
        s += (likes + comments * 2) * 2;
        if (data.follows.some(f => f.follower_id === currentUserId && f.following_id === p.user_id)) s += 30;
        const theyLikedYou = data.swipes.some(s => s.target_id === currentUserId && s.user_id === p.user_id && s.direction === 'like');
        if (theyLikedYou) s += 25;
        return { post: p, score: s };
      });
      scored.sort((a, b) => b.score - a.score);
      postIds = scored.map(x => x.post.id);
    }
    let rows = [];
    if (postIds.length) {
      const placeholders = postIds.map(() => '?').join(',');
      const raw = dbInstance.prepare(`
        SELECT 
          p.id, p.content, p.media, p.created_at,
          u.id as user_id, u.name, u.username, u.avatar,
          (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
          (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
          (SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id IN (${placeholders})
      `).all(currentUserId, ...postIds);
      const order = new Map(postIds.map((id, i) => [id, i]));
      rows = raw.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    }
    const posts = rows.map(r => ({
      ...r,
      user_liked: !!r.user_liked,
      media: r.media ? (() => { try { return JSON.parse(r.media); } catch (_) { return []; } })() : []
    }));
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', async (req, res) => {
  try {
    const currentUserId = req.userId;
    if (!currentUserId) return res.status(401).json({ error: 'Sign in required' });
    const { base64, mime } = req.body;
    if (!base64) return res.status(400).json({ error: 'base64 required' });
    const ext = (mime || '').split('/')[1] || 'jpg';
    const safe = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm'];
    const extSafe = safe.includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extSafe}`;
    const filePath = path.join(UPLOAD_DIR, name);
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buf);
    const url = '/uploads/' + name;
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const currentUserId = req.userId;
    const dbInstance = await db();
    const { content, userId, media } = req.body;
    const uid = userId ?? currentUserId;
    if (!content?.trim() && (!media || !media.length)) return res.status(400).json({ error: 'Content or media required' });
    const mediaJson = media && Array.isArray(media) ? JSON.stringify(media) : null;
    const result = dbInstance.prepare('INSERT INTO posts (user_id, content, media) VALUES (?, ?, ?)').run(uid, (content || '').trim(), mediaJson);
    const post = dbInstance.prepare(`
      SELECT p.id, p.content, p.media, p.created_at, p.user_id,
        u.name, u.username, u.avatar,
        0 as likes_count, 0 as comments_count
      FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?
    `).get(result.lastInsertRowid);
    post.media = post.media ? JSON.parse(post.media) : [];
    post.user_liked = false;
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const currentUserId = req.userId;
    const dbInstance = await db();
    const postId = parseInt(req.params.id);
    const userId = req.body.userId ?? currentUserId;
    const existing = dbInstance.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').get(postId, userId);
    if (existing) {
      dbInstance.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(postId, userId);
      return res.json({ liked: false });
    }
    dbInstance.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(postId, userId);
    res.json({ liked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/posts/:id/likes', async (req, res) => {
  try {
    const currentUserId = req.userId;
    const dbInstance = await db();
    const postId = parseInt(req.params.id);
    const count = dbInstance.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(postId).c;
    const userLiked = dbInstance.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(postId, currentUserId);
    res.json({ count, userLiked: !!userLiked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const dbInstance = await db();
    const comments = dbInstance.prepare(`
      SELECT c.id, c.content, c.created_at,
             u.name, u.username, u.avatar
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).all(parseInt(req.params.id));
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:id/comments', async (req, res) => {
  try {
    const currentUserId = req.userId;
    const dbInstance = await db();
    const postId = parseInt(req.params.id);
    const { content, userId } = req.body;
    const uid = userId ?? currentUserId;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    const result = dbInstance.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)').run(postId, uid, content.trim());
    const comment = dbInstance.prepare(`
      SELECT c.*, u.name, u.username, u.avatar
      FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const dbInstance = await db();
    const users = dbInstance.prepare('SELECT id, name, username, avatar, bio FROM users WHERE (is_blocked IS NULL OR is_blocked = 0)').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === ADMIN ROUTES ===
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const dbInstance = await db();
    const users = dbInstance.prepare('SELECT id, is_blocked FROM users').all();
    const posts = dbInstance.prepare('SELECT COUNT(*) as c FROM posts').get();
    const likes = dbInstance.prepare('SELECT COUNT(*) as c FROM likes').get();
    const comments = dbInstance.prepare('SELECT COUNT(*) as c FROM comments').get();
    const follows = dbInstance.prepare('SELECT COUNT(*) as c FROM follows').get();
    const swipes = dbInstance.prepare('SELECT COUNT(*) as c FROM swipes').get();
    const blocked = users.filter(u => u.is_blocked).length;
    res.json({
      users: users.length,
      blocked,
      active: users.length - blocked,
      posts: posts.c,
      likes: likes.c,
      comments: comments.c,
      follows: follows.c,
      swipes: swipes.c
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const dbInstance = await db();
    const users = dbInstance.prepare(`
      SELECT id, name, username, email, avatar, bio, created_at, is_blocked, blocked_at
      FROM users
      ORDER BY id ASC
    `).all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/block', requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (!targetId) return res.status(400).json({ error: 'Invalid user ID' });
    if (targetId === req.adminUserId) return res.status(400).json({ error: 'Cannot block yourself' });
    const dbInstance = await db();
    if (isAdmin(dbInstance, targetId)) return res.status(400).json({ error: 'Cannot block an admin' });
    dbInstance.prepare('UPDATE users SET is_blocked = 1, blocked_at = ? WHERE id = ?').run(new Date().toISOString(), targetId);
    res.json({ blocked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/unblock', requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (!targetId) return res.status(400).json({ error: 'Invalid user ID' });
    const dbInstance = await db();
    dbInstance.prepare('UPDATE users SET is_blocked = 0, blocked_at = NULL WHERE id = ?').run(targetId);
    res.json({ blocked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  const dbInstance = await getDb();
  app.locals.db = dbInstance;
  app.listen(PORT, () => {
    console.log(`Nexus feed running at http://localhost:${PORT}`);
  });
}

start();
