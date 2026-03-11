const { getStore } = require('@netlify/blobs');
const jwt = require('jsonwebtoken');

const BLOB_STORE = 'nexus-data';
const JWT_SECRET = process.env.JWT_SECRET || 'nexus-dev-secret-change-in-production';

function getUserId(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return 1;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch (_) {
    return 1;
  }
}

function getAuthUserId(event) {
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

function isAdmin(data, userId) {
  if (!userId) return false;
  const adminIds = (process.env.ADMIN_USER_IDS || '1').split(',').map(s => parseInt(s.trim())).filter(Boolean);
  if (adminIds.includes(userId)) return true;
  const u = data.users.find(x => x.id === userId);
  return !!(u && u.is_admin);
}

function notBlocked(u) {
  return !(u.is_blocked);
}

async function getData() {
  const store = getStore({ name: BLOB_STORE, consistency: 'strong' });
  const raw = await store.get('db');
  if (!raw) {
    const seed = {
      users: [
        { id: 1, name: 'Luna', username: 'luna_midnight', avatar: '🌙', bio: 'Night owl. Stars over screens.' },
        { id: 2, name: 'Amara', username: 'amara_rose', avatar: '🌹', bio: 'Living for the moments that take your breath away.' },
        { id: 3, name: 'Seren', username: 'seren_soul', avatar: '✨', bio: 'Connection is everything.' },
        { id: 4, name: 'Kai', username: 'kai_embers', avatar: '🔥', bio: 'Chasing heat and high vibes.' },
        { id: 5, name: 'Violet', username: 'violet_hour', avatar: '🌺', bio: 'Magic lives in the in-between.' },
        { id: 6, name: 'Orion', username: 'orion_sky', avatar: '⭐', bio: 'Reach for what pulls you.' }
      ],
      posts: [
        { id: 1, user_id: 1, content: 'Lost in thought under the stars tonight. Who else feels the pull of the moon?', created_at: new Date().toISOString() },
        { id: 2, user_id: 2, content: 'Life is too short for ordinary moments. Chase the ones that make your heart race.', created_at: new Date().toISOString() },
        { id: 3, user_id: 3, content: 'Connection is everything. Reach out to someone who crossed your mind today.', created_at: new Date().toISOString() },
        { id: 4, user_id: 4, content: 'No filter. Just fire.', created_at: new Date().toISOString() },
        { id: 5, user_id: 5, content: 'The violet hour hits different.', created_at: new Date().toISOString() }
      ],
      likes: [],
      comments: [],
      follows: [],
      swipes: [],
      nextUserId: 7,
      nextPostId: 6,
      nextCommentId: 1
    };
    await store.set('db', JSON.stringify(seed));
    return seed;
  }
  const data = JSON.parse(raw);
  if (!data.follows) data.follows = [];
  if (!data.swipes) data.swipes = [];
  if (!data.nextUserId) data.nextUserId = Math.max(0, ...(data.users || []).map(u => u.id)) + 1;
  data.users = (data.users || []).map(u => ({ ...u, is_blocked: u.is_blocked || false }));
  return data;
}

async function setData(data) {
  const store = getStore({ name: BLOB_STORE, consistency: 'strong' });
  await store.set('db', JSON.stringify(data));
}

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  };
}

// === BLENDED ALGORITHM (OnlyFans + Tinder) ===
function computeDiscoveryScore(targetUser, data, viewerId) {
  let score = 0;

  // ONLYFANS: Creator popularity (followers + engagement)
  const followers = data.follows.filter(f => f.following_id === targetUser.id).length;
  const theirPosts = data.posts.filter(p => p.user_id === targetUser.id);
  const postIds = theirPosts.map(p => p.id);
  const engagement = data.likes.filter(l => postIds.includes(l.post_id)).length +
    data.comments.filter(c => postIds.includes(c.post_id)).length;
  const popularity = followers * 2 + Math.log1p(engagement);
  score += popularity * 0.35;

  // TINDER: Mutual interest — they liked you (swiped right on you)
  const theyLikedYou = data.swipes.some(s => s.target_id === viewerId && s.user_id === targetUser.id && s.direction === 'like');
  if (theyLikedYou) score += 50;

  // TINDER: Compatibility — overlap of who you both liked
  const youLiked = data.swipes.filter(s => s.user_id === viewerId && s.direction === 'like').map(s => s.target_id);
  const theyLiked = data.swipes.filter(s => s.user_id === targetUser.id && s.direction === 'like').map(s => s.target_id);
  const overlap = youLiked.filter(id => theyLiked.includes(id)).length;
  score += overlap * 8;

  // Recency: recent swipes or posts
  const lastActivity = [...data.swipes.filter(s => s.user_id === targetUser.id), ...theirPosts]
    .map(x => new Date(x.created_at).getTime())
    .filter(Boolean);
  const maxActivity = lastActivity.length ? Math.max(...lastActivity) : 0;
  const hoursSince = (Date.now() - maxActivity) / 3600000;
  const recencyBoost = Math.max(0, 15 - hoursSince * 0.5);
  score += recencyBoost;

  return score;
}

function computeFeedScore(post, data, viewerId) {
  const creator = data.users.find(u => u.id === post.user_id) || {};
  let score = 0;

  // Recency
  const age = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
  score += Math.max(0, 72 - age) * 0.5;

  // Creator popularity (OnlyFans)
  const followers = data.follows.filter(f => f.following_id === post.user_id).length;
  score += Math.log1p(followers) * 5;

  // Engagement on this post
  const likes = data.likes.filter(l => l.post_id === post.id).length;
  const comments = data.comments.filter(c => c.post_id === post.id).length;
  score += (likes + comments * 2) * 2;

  // You follow them (OnlyFans — subscribed content)
  const youFollow = data.follows.some(f => f.follower_id === viewerId && f.following_id === post.user_id);
  if (youFollow) score += 30;

  // Mutual connection (Tinder-style)
  const youLiked = data.swipes.filter(s => s.user_id === viewerId && s.direction === 'like').map(s => s.target_id);
  const theyLikedYou = data.swipes.some(s => s.target_id === viewerId && s.user_id === post.user_id && s.direction === 'like');
  if (theyLikedYou) score += 25;

  return score;
}

exports.handler = async (event) => {
  const path = '/' + (event.queryStringParameters?.path || '').replace(/^\//, '');
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};
  let body = {};
  try {
    if (event.body) body = JSON.parse(event.body);
  } catch (_) {}

  try {
    const data = await getData();
    const authUserId = getAuthUserId(event);

    const requireAuthPaths = ['/discovery', '/matches', '/feed', '/swipe', '/follow', '/posts', '/upload'];
    const pathRequiresAuth = requireAuthPaths.includes(path) || /^\/posts\/\d+\/(like|comments)$/.test(path);
    if (pathRequiresAuth && !authUserId) return json({ error: 'Sign in required' }, 401);

    if (authUserId) {
      const me = data.users.find(u => u.id === authUserId);
      if (me && me.is_blocked) return json({ error: 'Account has been suspended' }, 403);
    }

    const currentUserId = authUserId ?? getUserId(event);

    const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://localhost:8888';

    // GET /media/:id — serve uploaded file from Blobs
    const mediaMatch = path.match(/^\/media\/(.+)$/);
    if (mediaMatch && method === 'GET') {
      const key = mediaMatch[1];
      const uploadStore = getStore({ name: 'nexus-uploads', consistency: 'strong' });
      const raw = await uploadStore.get(key);
      if (!raw) return { statusCode: 404, body: 'Not found' };
      let mime = 'application/octet-stream';
      let b64 = raw;
      try {
        const parsed = JSON.parse(raw);
        mime = parsed.mime || mime;
        b64 = parsed.base64 || raw;
      } catch (_) {
        const idx = raw.indexOf(',');
        if (idx > 0) { mime = raw.slice(0, idx); b64 = raw.slice(idx + 1); }
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000' },
        body: b64,
        isBase64Encoded: true
      };
    }

    // POST /upload — store image/video in Blobs, return URL
    if (path === '/upload' && method === 'POST') {
      const { base64, mime } = body;
      if (!base64) return json({ error: 'base64 required' }, 400);
      const ext = (mime || '').split('/')[1] || 'jpg';
      const safe = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm'];
      const extSafe = safe.includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extSafe}`;
      const uploadStore = getStore({ name: 'nexus-uploads', consistency: 'strong' });
      await uploadStore.set(id, JSON.stringify({ mime: mime || 'image/jpeg', base64 }));
      const url = `${SITE_URL.replace(/\/$/, '')}/api/media/${id}`;
      return json({ url });
    }

    // GET /discovery — algorithm-ranked users to swipe on
    if (path === '/discovery' && method === 'GET') {
      const activeUsers = data.users.filter(notBlocked);
      const swiped = data.swipes.filter(s => s.user_id === currentUserId).map(s => s.target_id);
      const candidates = activeUsers
        .filter(u => u.id !== currentUserId && !swiped.includes(u.id))
        .map(u => ({ user: u, score: computeDiscoveryScore(u, { ...data, users: activeUsers }, currentUserId) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(x => ({ ...x.user, _score: Math.round(x.score) }));
      return json(candidates);
    }

    // POST /swipe — Tinder: like or pass
    const swipeMatch = path.match(/^\/swipe$/);
    if (swipeMatch && method === 'POST') {
      const { targetId, direction } = body; // direction: 'like' | 'pass'
      if (!targetId || !['like', 'pass'].includes(direction)) return json({ error: 'Invalid swipe' }, 400);
      const existing = data.swipes.find(s => s.user_id === currentUserId && s.target_id === parseInt(targetId));
      if (existing) return json({ ok: true });
      data.swipes.push({
        user_id: currentUserId,
        target_id: parseInt(targetId),
        direction,
        created_at: new Date().toISOString()
      });
      await setData(data);
      return json({ ok: true });
    }

    // GET /matches — Tinder: mutual likes
    if (path === '/matches' && method === 'GET') {
      const activeUsers = data.users.filter(notBlocked);
      const youLiked = data.swipes.filter(s => s.user_id === currentUserId && s.direction === 'like').map(s => s.target_id);
      const mutual = youLiked.filter(tid =>
        data.swipes.some(s => s.user_id === tid && s.target_id === currentUserId && s.direction === 'like')
      );
      const matches = mutual.map(id => activeUsers.find(u => u.id === id)).filter(Boolean);
      return json(matches);
    }

    // POST /follow — OnlyFans: follow creator
    const followMatch = path.match(/^\/follow$/);
    if (followMatch && method === 'POST') {
      const targetId = parseInt(body.targetId);
      if (!targetId) return json({ error: 'Invalid target' }, 400);
      const exists = data.follows.some(f => f.follower_id === currentUserId && f.following_id === targetId);
      if (exists) return json({ following: true });
      data.follows.push({ follower_id: currentUserId, following_id: targetId });
      await setData(data);
      return json({ following: true }, 201);
    }

    // GET /feed — supports ?mode=for-you | following
    if (path === '/feed' && method === 'GET') {
      const blockedIds = new Set(data.users.filter(u => u.is_blocked).map(u => u.id));
      const activePosts = data.posts.filter(p => !blockedIds.has(p.user_id));
      const mode = qs.mode || 'for-you';
      let postIds;
      if (mode === 'following') {
        const following = data.follows.filter(f => f.follower_id === currentUserId).map(f => f.following_id);
        postIds = activePosts.filter(p => following.includes(p.user_id)).map(p => p.id);
      } else {
        const scored = activePosts.map(p => ({ post: p, score: computeFeedScore(p, data, currentUserId) }));
        scored.sort((a, b) => b.score - a.score);
        postIds = scored.map(x => x.post.id);
      }
      const posts = postIds.map(id => data.posts.find(p => p.id === id)).filter(Boolean);
      const result = posts.map(p => {
        const u = data.users.find(us => us.id === p.user_id) || {};
        const likes_count = data.likes.filter(l => l.post_id === p.id).length;
        const comments_count = data.comments.filter(c => c.post_id === p.id).length;
        const user_liked = data.likes.some(l => l.post_id === p.id && l.user_id === currentUserId);
        return {
          id: p.id,
          content: p.content,
          media: (p.media && Array.isArray(p.media)) ? p.media : (p.media ? (() => { try { return JSON.parse(p.media); } catch (_) { return []; } })() : []),
          created_at: p.created_at,
          user_id: u.id,
          name: u.name,
          username: u.username,
          avatar: u.avatar,
          likes_count,
          comments_count,
          user_liked
        };
      });
      return json(result);
    }

    // POST /posts
    if (path === '/posts' && method === 'POST') {
      const content = (body.content || '').trim();
      const media = body.media && Array.isArray(body.media) ? body.media : [];
      if (!content && !media.length) return json({ error: 'Content or media required' }, 400);
      const uid = body.userId ?? currentUserId;
      const u = data.users.find(us => us.id === uid) || data.users[0];
      const post = {
        id: data.nextPostId++,
        user_id: uid,
        content: content || '',
        media,
        created_at: new Date().toISOString()
      };
      data.posts.push(post);
      await setData(data);
      return json({
        ...post,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
        likes_count: 0,
        comments_count: 0,
        user_liked: false
      }, 201);
    }

    // POST /posts/:id/like
    const likeMatch = path.match(/^\/posts\/(\d+)\/like$/);
    if (likeMatch && method === 'POST') {
      const postId = parseInt(likeMatch[1]);
      const userId = body.userId ?? currentUserId;
      const idx = data.likes.findIndex(l => l.post_id === postId && l.user_id === userId);
      if (idx >= 0) {
        data.likes.splice(idx, 1);
        await setData(data);
        return json({ liked: false });
      }
      data.likes.push({ post_id: postId, user_id: userId });
      await setData(data);
      return json({ liked: true });
    }

    // GET /posts/:id/comments
    const commentsMatch = path.match(/^\/posts\/(\d+)\/comments$/);
    if (commentsMatch && method === 'GET') {
      const postId = parseInt(commentsMatch[1]);
      const comments = data.comments
        .filter(c => c.post_id === postId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(c => {
          const u = data.users.find(us => us.id === c.user_id) || {};
          return { ...c, name: u.name, username: u.username, avatar: u.avatar };
        });
      return json(comments);
    }

    // POST /posts/:id/comments
    const postCommentsMatch = path.match(/^\/posts\/(\d+)\/comments$/);
    if (postCommentsMatch && method === 'POST') {
      const postId = parseInt(postCommentsMatch[1]);
      const content = (body.content || '').trim();
      if (!content) return json({ error: 'Content required' }, 400);
      const uid = body.userId ?? currentUserId;
      const u = data.users.find(us => us.id === uid) || data.users[0];
      const comment = {
        id: data.nextCommentId++,
        post_id: postId,
        user_id: uid,
        content,
        created_at: new Date().toISOString(),
        name: u.name,
        username: u.username,
        avatar: u.avatar
      };
      data.comments.push({ id: comment.id, post_id: postId, user_id: uid, content, created_at: comment.created_at });
      await setData(data);
      return json(comment, 201);
    }

    // GET /users
    if (path === '/users' && method === 'GET') {
      const active = data.users.filter(notBlocked);
      return json(active.map(({ id, name, username, avatar, bio }) => ({ id, name, username, avatar, bio })));
    }

    // === ADMIN ROUTES ===
    if (path === '/admin/stats' && method === 'GET') {
      if (!authUserId || !isAdmin(data, authUserId)) return json({ error: 'Admin access required' }, 403);
      const blocked = data.users.filter(u => u.is_blocked).length;
      return json({
        users: data.users.length,
        blocked,
        active: data.users.length - blocked,
        posts: (data.posts || []).length,
        likes: (data.likes || []).length,
        comments: (data.comments || []).length,
        follows: (data.follows || []).length,
        swipes: (data.swipes || []).length
      });
    }

    if (path === '/admin/users' && method === 'GET') {
      if (!authUserId || !isAdmin(data, authUserId)) return json({ error: 'Admin access required' }, 403);
      return json(data.users.map(u => ({
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email || null,
        avatar: u.avatar,
        bio: u.bio,
        created_at: u.created_at,
        is_blocked: !!u.is_blocked,
        blocked_at: u.blocked_at || null
      })));
    }

    const blockMatch = path.match(/^\/admin\/users\/(\d+)\/block$/);
    if (blockMatch && method === 'POST') {
      if (!authUserId || !isAdmin(data, authUserId)) return json({ error: 'Admin access required' }, 403);
      const targetId = parseInt(blockMatch[1]);
      if (targetId === authUserId) return json({ error: 'Cannot block yourself' }, 400);
      if (isAdmin(data, targetId)) return json({ error: 'Cannot block an admin' }, 400);
      const u = data.users.find(x => x.id === targetId);
      if (!u) return json({ error: 'User not found' }, 404);
      u.is_blocked = true;
      u.blocked_at = new Date().toISOString();
      await setData(data);
      return json({ blocked: true });
    }

    const unblockMatch = path.match(/^\/admin\/users\/(\d+)\/unblock$/);
    if (unblockMatch && method === 'POST') {
      if (!authUserId || !isAdmin(data, authUserId)) return json({ error: 'Admin access required' }, 403);
      const targetId = parseInt(unblockMatch[1]);
      const u = data.users.find(x => x.id === targetId);
      if (!u) return json({ error: 'User not found' }, 404);
      u.is_blocked = false;
      u.blocked_at = null;
      await setData(data);
      return json({ blocked: false });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};
