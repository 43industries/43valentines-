const API = '/api';

// Auth state
let token = localStorage.getItem('nexus_token');
let user = null;

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

async function fetchApi(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...opts.headers } });
  if (res.status === 401) {
    token = null;
    localStorage.removeItem('nexus_token');
    if (typeof setUser === 'function') setUser(null);
  }
  return res;
}

// DOM
const feedEl = document.getElementById('feed');
const emptyState = document.getElementById('emptyState');
const postInput = document.getElementById('postInput');
const postBtn = document.getElementById('postBtn');
const commentModal = document.getElementById('commentModal');
const modalPost = document.getElementById('modalPost');
const commentsList = document.getElementById('commentsList');
const commentInput = document.getElementById('commentInput');
const commentBtn = document.getElementById('commentBtn');
const modalClose = document.querySelector('.modal-close');
const modalBackdrop = document.querySelector('.modal-backdrop');
const swipeStack = document.getElementById('swipeStack');
const swipeCards = document.getElementById('swipeCards');
const passBtn = document.getElementById('passBtn');
const likeBtn = document.getElementById('likeBtn');
const followBtn = document.getElementById('followBtn');
const discoverEmpty = document.getElementById('discoverEmpty');
const matchesPreview = document.getElementById('matchesPreview');
const matchesList = document.getElementById('matchesList');
const matchesGrid = document.getElementById('matchesGrid');
const matchesEmpty = document.getElementById('matchesEmpty');

let currentPostId = null;
let discoveryQueue = [];
let feedMode = 'for-you';
let pendingPostMedia = [];

// Tab switching
document.querySelectorAll('.side-links a[data-tab]').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.side-links a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(a.dataset.tab + 'View').classList.add('active');
    if (a.dataset.tab === 'discover') loadDiscovery();
    if (a.dataset.tab === 'feed') loadFeed();
    if (a.dataset.tab === 'matches') loadMatches();
  });
});

document.querySelectorAll('.feed-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.feed-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    feedMode = btn.dataset.mode;
    loadFeed();
  });
});

// Discover / Swipe
async function loadDiscovery() {
  try {
    const res = await fetchApi(`${API}/discovery`);
    const data = await res.json();
    discoveryQueue = res.ok && Array.isArray(data) ? data : [];
    renderDiscovery();
  } catch (err) {
    discoverEmpty.textContent = 'Could not load discovery.';
    discoverEmpty.style.display = 'block';
    swipeCards.innerHTML = '';
  }
}

function renderDiscovery() {
  discoverEmpty.style.display = discoveryQueue.length ? 'none' : 'block';
  if (!discoveryQueue.length) {
    swipeCards.innerHTML = '';
    document.getElementById('swipeActions').style.display = 'none';
    return;
  }
  document.getElementById('swipeActions').style.display = 'flex';
  const current = discoveryQueue[0];
  swipeCards.innerHTML = `
    <div class="swipe-card" data-id="${current.id}">
      <div class="swipe-card-avatar">${initial(current.name)}</div>
      <h3>${escapeHtml(current.name)}</h3>
      <span class="swipe-handle">@${escapeHtml(current.username)}</span>
      <p class="swipe-bio">${escapeHtml(current.bio || '')}</p>
    </div>
  `;
}

async function swipe(direction) {
  if (!discoveryQueue.length) return;
  const target = discoveryQueue[0];
  try {
    await fetchApi(`${API}/swipe`, {
      method: 'POST',
      body: JSON.stringify({ targetId: target.id, direction })
    });
    discoveryQueue.shift();
    if (direction === 'like') {
      await fetchApi(`${API}/follow`, {
        method: 'POST',
        body: JSON.stringify({ targetId: target.id })
      });
    }
    renderDiscovery();
    loadMatchesPreview();
  } catch (err) {
    console.error(err);
  }
}

passBtn.addEventListener('click', () => swipe('pass'));
likeBtn.addEventListener('click', () => swipe('like'));
followBtn.addEventListener('click', async () => {
  if (!discoveryQueue.length) return;
  const target = discoveryQueue[0];
  try {
    await fetchApi(`${API}/follow`, {
      method: 'POST',
      body: JSON.stringify({ targetId: target.id })
    });
    await fetchApi(`${API}/swipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: target.id, direction: 'pass' })
    });
    discoveryQueue.shift();
    renderDiscovery();
    loadMatchesPreview();
  } catch (err) {
    console.error(err);
  }
});

// Matches
async function loadMatchesPreview() {
  try {
    const res = await fetchApi(`${API}/matches`);
    const data = await res.json();
    const matches = res.ok && Array.isArray(data) ? data : [];
    matchesList.innerHTML = matches.slice(0, 5).map(m =>
      `<span class="match-avatar" title="${escapeHtml(m.name)}">${initial(m.name)}</span>`
    ).join('');
  } catch (_) {}
}

async function loadMatches() {
  try {
    const res = await fetchApi(`${API}/matches`);
    const data = await res.json();
    const matches = res.ok && Array.isArray(data) ? data : [];
    matchesEmpty.style.display = matches.length ? 'none' : 'block';
    matchesGrid.innerHTML = matches.map(m => `
      <div class="match-card">
        <span class="match-card-avatar">${initial(m.name)}</span>
        <h4>${escapeHtml(m.name)}</h4>
        <span class="handle">@${escapeHtml(m.username)}</span>
      </div>
    `).join('');
  } catch (err) {
    matchesEmpty.textContent = 'Could not load matches.';
    matchesEmpty.style.display = 'block';
  }
}

// Feed
async function loadFeed() {
  try {
    const res = await fetchApi(`${API}/feed?mode=${feedMode}`);
    const data = await res.json();
    const posts = res.ok && Array.isArray(data) ? data : [];
    renderFeed(posts);
  } catch (err) {
    emptyState.textContent = 'Could not load feed.';
  }
}

function renderFeed(posts) {
  if (!posts?.length) {
    emptyState.textContent = feedMode === 'following' ? 'Follow creators to see their posts here.' : 'No posts yet.';
    emptyState.style.display = 'block';
    feedEl.innerHTML = '';
    return;
  }
  emptyState.style.display = 'none';
  feedEl.innerHTML = posts.map((p) => postToHTML(p)).join('');

  feedEl.querySelectorAll('.btn-like').forEach((btn) => {
    btn.addEventListener('click', () => handleLike(btn, parseInt(btn.dataset.postId)));
  });
  feedEl.querySelectorAll('.btn-comment-open').forEach((btn) => {
    btn.addEventListener('click', () => openComments(parseInt(btn.dataset.postId)));
  });
}

function postToHTML(p) {
  const time = formatTime(p.created_at);
  const heartClass = p.user_liked ? 'liked' : '';
  const media = (p.media && Array.isArray(p.media)) ? p.media : [];
  const mediaHtml = media.length ? `<div class="post-media">${media.map(url => {
    const isVideo = /\.(mp4|webm|ogg)(\?|$)/i.test(url);
    return isVideo
      ? `<div class="post-media-item"><video src="${escapeHtml(url)}" controls></video></div>`
      : `<div class="post-media-item"><img src="${escapeHtml(url)}" alt="Post media"></div>`;
  }).join('')}</div>` : '';
  return `
    <article class="post-card" data-id="${p.id}">
      <div class="post-header">
        <span class="post-avatar">${initial(p.name)}</span>
        <div class="post-meta">
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="handle">@${escapeHtml(p.username)}</span>
          <span class="time">${time}</span>
        </div>
      </div>
      ${p.content ? `<div class="post-content">${escapeHtml(p.content)}</div>` : ''}
      ${mediaHtml}
      <div class="post-actions">
        <button class="post-action btn-like ${heartClass}" data-post-id="${p.id}">
          <svg viewBox="0 0 24 24" fill="${p.user_liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span class="like-count">${p.likes_count}</span>
        </button>
        <button class="post-action btn-comment-open" data-post-id="${p.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>${p.comments_count}</span>
        </button>
      </div>
    </article>
  `;
}

async function handleLike(btn, postId) {
  try {
    const res = await fetchApi(`${API}/posts/${postId}/like`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const { liked } = await res.json();
    const countEl = btn.querySelector('.like-count');
    let count = parseInt(countEl.textContent) || 0;
    count = liked ? count + 1 : count - 1;
    countEl.textContent = Math.max(0, count);
    btn.classList.toggle('liked', liked);
    btn.querySelector('svg').setAttribute('fill', liked ? 'currentColor' : 'none');
  } catch (err) {
    console.error(err);
  }
}

async function openComments(postId) {
  currentPostId = postId;
  const postCard = document.querySelector(`.post-card[data-id="${postId}"]`);
  const clone = postCard.cloneNode(true);
  clone.querySelector('.post-actions').remove();
  modalPost.innerHTML = '';
  modalPost.appendChild(clone);

  commentModal.classList.add('active');
  await loadComments(postId);
  commentInput.value = '';
  commentInput.focus();
}

async function loadComments(postId) {
  try {
    const res = await fetchApi(`${API}/posts/${postId}/comments`);
    const comments = await res.json();
    commentsList.innerHTML = comments.length
      ? comments.map((c) => commentToHTML(c)).join('')
      : '<p class="empty-state">No comments yet.</p>';
  } catch (err) {
    commentsList.innerHTML = '<p class="empty-state">Could not load comments.</p>';
  }
}

function commentToHTML(c) {
  const time = formatTime(c.created_at);
  return `
    <div class="comment-item">
      <span class="comment-avatar">${initial(c.name)}</span>
      <div class="comment-body">
        <span class="name">${escapeHtml(c.name)}</span>
        <p class="content">${escapeHtml(c.content)}</p>
        <span class="time">${time}</span>
      </div>
    </div>
  `;
}

async function submitComment() {
  if (!currentPostId || !commentInput.value.trim()) return;
  try {
    const res = await fetchApi(`${API}/posts/${currentPostId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: commentInput.value.trim() }),
    });
    const comment = await res.json();
    const html = commentToHTML(comment);
    const empty = commentsList.querySelector('.empty-state');
    if (empty) empty.remove();
    commentsList.insertAdjacentHTML('beforeend', html);
    commentInput.value = '';

    const countBtn = document.querySelector(`.btn-comment-open[data-post-id="${currentPostId}"] span`);
    if (countBtn) countBtn.textContent = parseInt(countBtn.textContent || 0) + 1;
  } catch (err) {
    console.error(err);
  }
}

async function createPost() {
  const content = postInput.value.trim();
  if (!content && !pendingPostMedia.length) return;
  try {
    const res = await fetchApi(`${API}/posts`, {
      method: 'POST',
      body: JSON.stringify({ content: content || '', media: pendingPostMedia }),
    });
    const post = await res.json();
    post.likes_count = 0;
    post.comments_count = 0;
    post.user_liked = false;
    const html = postToHTML(post);
    const first = feedEl.querySelector('.post-card');
    if (first) {
      feedEl.insertAdjacentHTML('afterbegin', html);
    } else {
      emptyState.style.display = 'none';
      feedEl.innerHTML = html;
    }
    const newCard = feedEl.querySelector('.post-card');
    newCard.querySelector('.btn-like')?.addEventListener('click', (e) =>
      handleLike(e.currentTarget, post.id)
    );
    newCard.querySelector('.btn-comment-open')?.addEventListener('click', () =>
      openComments(post.id)
    );
    postInput.value = '';
    pendingPostMedia = [];
    renderComposerMedia();
  } catch (err) {
    console.error(err);
  }
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function initial(name) {
  return (name || '?')[0].toUpperCase();
}

document.getElementById('guestSignupBtn').addEventListener('click', () => {
  document.querySelector('.auth-title').textContent = 'Join Nexus';
  document.querySelector('.auth-tabs').style.display = 'flex';
  showAuthForm('email-phone');
  authModal.classList.add('active');
});

function renderComposerMedia() {
  const container = document.getElementById('composerMedia');
  container.innerHTML = pendingPostMedia.map((url, i) => {
    const isVideo = /\.(mp4|webm|ogg)(\?|$)/i.test(url);
    return `<div class="composer-media-item">
      ${isVideo ? `<video src="${url}" muted></video>` : `<img src="${url}" alt="">`}
      <button type="button" class="remove-media" data-i="${i}" aria-label="Remove">×</button>
    </div>`;
  }).join('');
  container.querySelectorAll('.remove-media').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingPostMedia.splice(parseInt(btn.dataset.i), 1);
      renderComposerMedia();
    });
  });
}

document.getElementById('postMediaInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  for (const file of files) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
    const reader = new FileReader();
    const base64 = await new Promise((res, rej) => {
      reader.onload = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) continue;
    const mime = match[1];
    const b64 = match[2];
    try {
      const res = await fetchApi(`${API}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: b64, mime })
      });
      const data = await res.json();
      if (data.url) pendingPostMedia.push(data.url);
    } catch (_) {}
  }
  renderComposerMedia();
});

postBtn.addEventListener('click', createPost);
postInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    createPost();
  }
});

commentBtn.addEventListener('click', submitComment);
commentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitComment();
  }
});

modalClose.addEventListener('click', () => commentModal.classList.remove('active'));
modalBackdrop.addEventListener('click', () => commentModal.classList.remove('active'));

// Auth
const authModal = document.getElementById('authModal');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const navUser = document.getElementById('navUser');
const navUserName = document.getElementById('navUserName');
const navTagline = document.getElementById('navTagline');

function setUser(u) {
  user = u;
  const adminLink = document.getElementById('adminLink');
  if (u) {
    token && localStorage.setItem('nexus_token', token);
    if (loginBtn) loginBtn.style.display = 'none';
    if (navUser) navUser.style.display = 'flex';
    navUserName.textContent = u.name || u.username;
    if (adminLink) adminLink.style.display = u.is_admin ? 'inline' : 'none';
    const guestCta = document.getElementById('discoverGuestCTA');
    if (guestCta) guestCta.style.display = 'none';
    document.querySelector('.current-user .avatar').textContent = initial(u.name);
    document.querySelector('.current-user .name').textContent = u.name || u.username;
    document.querySelector('.current-user .handle').textContent = '@' + (u.username || '');
    document.querySelector('.composer-avatar').textContent = initial(u.name);
  } else {
    localStorage.removeItem('nexus_token');
    token = null;
    if (loginBtn) loginBtn.style.display = 'block';
    if (navUser) navUser.style.display = 'none';
    if (adminLink) adminLink.style.display = 'none';
    const guestCta = document.getElementById('discoverGuestCTA');
    if (guestCta) guestCta.style.display = 'block';
    document.querySelector('.current-user .avatar').textContent = '?';
    document.querySelector('.current-user .name').textContent = 'Guest';
    document.querySelector('.current-user .handle').textContent = '@guest';
  }
}

async function checkAuth() {
  const params = new URLSearchParams(location.search);
  const resetToken = params.get('reset');
  if (resetToken) {
    authModal.classList.add('active');
    document.querySelector('.auth-title').textContent = 'Reset password';
    document.querySelector('.auth-tabs').style.display = 'none';
    showAuthForm('reset');
    document.getElementById('authResetForm').dataset.resetToken = resetToken;
    history.replaceState({}, '', location.pathname);
    return;
  }
  const magic = params.get('magic');
  if (magic) {
    try {
      const res = await fetch(`${API}/auth/magic-link/verify?token=${magic}`);
      const data = await res.json();
      if (data.token) {
        token = data.token;
        setUser(data.user);
        history.replaceState({}, '', location.pathname);
        return;
      }
    } catch (_) {}
  }
  if (token) {
    try {
      const res = await fetchApi(`${API}/auth/me`);
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        return;
      }
    } catch (_) {}
  }
  setUser(null);
}

loginBtn.addEventListener('click', () => {
  document.querySelector('.auth-title').textContent = 'Join Nexus';
  document.querySelector('.auth-tabs').style.display = 'flex';
  showAuthForm('email-phone');
  showAuthError('');
  authModal.classList.add('active');
});

logoutBtn.addEventListener('click', () => {
  setUser(null);
  authModal.classList.remove('active');
});

authModal.querySelector('.auth-close').addEventListener('click', () => authModal.classList.remove('active'));
authModal.querySelector('.auth-backdrop').addEventListener('click', () => authModal.classList.remove('active'));

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg || '';
  el.style.color = msg && !msg.includes('Check your email') && !msg.includes('Use this link') ? '' : 'var(--cream-dim)';
}

function showAuthForm(method) {
  document.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');
  document.getElementById('authGoogleBtn').style.display = 'none';
  document.getElementById('authLoginForm').style.display = 'none';
  document.getElementById('authUnifiedForm').style.display = 'none';
  document.getElementById('authForgotForm').style.display = 'none';
  document.getElementById('authResetForm').style.display = 'none';
  if (method === 'email-phone' || method === 'email') document.getElementById('authUnifiedForm').style.display = 'block';
  else if (method === 'google') document.getElementById('authGoogleBtn').style.display = 'block';
  else if (method === 'forgot') document.getElementById('authForgotForm').style.display = 'block';
  else if (method === 'reset') document.getElementById('authResetForm').style.display = 'block';
  else if (method === 'login') document.getElementById('authLoginForm').style.display = 'block';

  if (method === 'email-phone' || method === 'email') {
    document.getElementById('authUnifiedForm').dataset.mode = 'signup';
    document.getElementById('authSubmitBtn').textContent = 'Continue';
    document.getElementById('authExtraFields').style.display = 'none';
    document.querySelector('#authUnifiedForm input[name="password"]').removeAttribute('required');
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest?.('#showLogin')) {
    e.preventDefault();
    document.getElementById('authForgotForm').style.display = 'none';
    document.getElementById('authUnifiedForm').style.display = 'none';
    document.getElementById('authLoginForm').style.display = 'block';
    showAuthError('');
  }
});
document.getElementById('showSignup').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('authLoginForm').style.display = 'none';
  document.getElementById('authForgotForm').style.display = 'none';
  showAuthForm('email-phone');
});
document.getElementById('showForgot').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('authLoginForm').style.display = 'none';
  document.getElementById('authForgotForm').style.display = 'block';
  document.getElementById('forgotResult').textContent = '';
});
document.getElementById('backToLogin').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('authForgotForm').style.display = 'none';
  document.getElementById('authLoginForm').style.display = 'block';
});

function isEmail(val) {
  return val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
}
function isPhone(val) {
  const digits = (val || '').replace(/\D/g, '');
  return digits.length >= 10;
}

document.getElementById('authUnifiedForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const identifier = (fd.get('identifier') || '').trim();
  const password = fd.get('password');
  const name = fd.get('name');
  const mode = e.target.dataset.mode || 'signup';

  if (!identifier) { showAuthError('Enter your email or phone number'); return; }

  if (mode === 'login') {
    if (!password) { showAuthError('Password required'); return; }
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();
      if (data.error) { showAuthError(data.error); return; }
      token = data.token;
      setUser(data.user);
      authModal.classList.remove('active');
    } catch (err) { showAuthError('Login failed'); }
    return;
  }

  if (isEmail(identifier)) {
    const extra = document.getElementById('authExtraFields');
    const passInput = extra.querySelector('input[name="password"]');
    if (extra.style.display === 'none') {
      extra.style.display = 'block';
      passInput.placeholder = 'Password (optional — or we\'ll email you a link)';
      passInput.removeAttribute('required');
      document.getElementById('authSubmitBtn').textContent = 'Sign up';
      return;
    }
    if (password && password.length > 0 && password.length < 6) {
      showAuthError('Password must be at least 6 characters');
      return;
    }
    if (password && password.length >= 6) {
      try {
        const res = await fetch(`${API}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password, name: name || undefined })
        });
        const data = await res.json();
        if (data.error) { showAuthError(data.error); return; }
        token = data.token;
        setUser(data.user);
        authModal.classList.remove('active');
      } catch (err) { showAuthError('Sign up failed'); }
    } else {
      try {
        const res = await fetch(`${API}/auth/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: identifier })
        });
        const data = await res.json();
        if (data.error) { showAuthError(data.error); return; }
        const el = document.getElementById('authError');
        el.textContent = data.sent ? 'Check your email for the sign-in link.' : (data.verifyUrl ? `No email configured. Use this link to sign in: ${data.verifyUrl}` : 'Link sent. Check your email.');
        el.style.color = 'var(--cream-dim)';
      } catch (err) { showAuthError('Failed to send magic link'); }
    }
    return;
  }

  if (isPhone(identifier)) {
    const extra = document.getElementById('authExtraFields');
    if (extra.style.display === 'none') {
      extra.style.display = 'block';
      extra.querySelector('input[name="password"]').setAttribute('required', '');
      extra.querySelector('input[name="password"]').placeholder = 'Password (min 6 characters)';
      document.getElementById('authSubmitBtn').textContent = 'Create account';
      return;
    }
    if (!password || password.length < 6) {
      showAuthError('Password must be at least 6 characters');
      return;
    }
    try {
      const res = await fetch(`${API}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, name: name || undefined })
      });
      const data = await res.json();
      if (data.error) { showAuthError(data.error); return; }
      token = data.token;
      setUser(data.user);
      authModal.classList.remove('active');
    } catch (err) { showAuthError('Sign up failed'); }
    return;
  }

  showAuthError('Enter a valid email or phone number');
});

document.getElementById('authLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: fd.get('identifier'), password: fd.get('password') })
    });
    const data = await res.json();
    if (data.error) { showAuthError(data.error); return; }
    token = data.token;
    setUser(data.user);
    authModal.classList.remove('active');
  } catch (err) { showAuthError('Login failed'); }
});

document.getElementById('authForgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = new FormData(e.target).get('email');
  try {
    const res = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.error) { showAuthError(data.error); return; }
    const el = document.getElementById('forgotResult');
    if (data.sent) el.textContent = 'If that email exists, check your inbox for the reset link.';
    else el.innerHTML = `No email configured. <a href="${data.resetUrl}" target="_blank">Click here to reset password</a>.`;
  } catch (err) { showAuthError('Failed to send reset link'); }
});

document.getElementById('authResetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const password = fd.get('password');
  const confirm = fd.get('passwordConfirm');
  if (password !== confirm) {
    showAuthError('Passwords do not match');
    return;
  }
  const resetToken = document.getElementById('authResetForm').dataset.resetToken;
  if (!resetToken) { showAuthError('Reset link expired'); return; }
  try {
    const res = await fetch(`${API}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password })
    });
    const data = await res.json();
    if (data.error) { showAuthError(data.error); return; }
    token = data.token;
    setUser(data.user);
    authModal.classList.remove('active');
    document.getElementById('authResetForm').removeAttribute('data-reset-token');
  } catch (err) { showAuthError('Reset failed'); }
});

async function initGoogleSignIn() {
  const configRes = await fetch(`${API}/auth/config`);
  const config = await configRes.json();
  if (!config.googleClientId) return false;
  if (!window.google) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    document.head.appendChild(script);
    await new Promise(r => script.onload = r);
  }
  const btn = document.getElementById('googleSignInBtn');
  if (btn.dataset.rendered) return true;
  btn.innerHTML = '';
  window.google.accounts.id.initialize({
    client_id: config.googleClientId,
    callback: async (response) => {
      try {
        const res = await fetch(`${API}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: response.credential })
        });
        const data = await res.json();
        if (data.error) { showAuthError(data.error); return; }
        token = data.token;
        setUser(data.user);
        authModal.classList.remove('active');
      } catch (e) { showAuthError('Google sign-in failed'); }
    }
  });
  window.google.accounts.id.renderButton(btn, { type: 'standard', theme: 'filled_black', size: 'large', text: 'continue_with', width: 300 });
  btn.dataset.rendered = '1';
  return true;
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    showAuthForm(tab.dataset.method);
    showAuthError('');
    if (tab.dataset.method === 'google') {
      const ok = await initGoogleSignIn();
      if (!ok) showAuthError('Google sign-in not configured (GOOGLE_CLIENT_ID)');
    }
  });
});

// Init
(async () => {
  await checkAuth();
  showAuthForm('email-phone');
  loadDiscovery();
  loadMatchesPreview();
})();
