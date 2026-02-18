const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Current user (for demo - no auth yet)
const currentUserId = 1;

// Helper to get db (async)
async function db() {
  return getDb();
}

// === API ROUTES ===

app.get('/api/feed', async (req, res) => {
  try {
    const dbInstance = await db();
    const rows = dbInstance.prepare(`
      SELECT 
        p.id, p.content, p.created_at,
        u.id as user_id, u.name, u.username, u.avatar,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
        (SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `).all(currentUserId);
    const posts = rows.map(r => ({ ...r, user_liked: !!r.user_liked }));
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const dbInstance = await db();
    const { content, userId } = req.body;
    const uid = userId ?? currentUserId;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    const result = dbInstance.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(uid, content.trim());
    const post = dbInstance.prepare(`
      SELECT p.*, u.name, u.username, u.avatar,
        0 as likes_count, 0 as comments_count
      FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?
    `).get(result.lastInsertRowid);
    post.user_liked = false;
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
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
    const users = dbInstance.prepare('SELECT id, name, username, avatar FROM users').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  await getDb();
  app.listen(PORT, () => {
    console.log(`Nexus feed running at http://localhost:${PORT}`);
  });
}

start();
