const API = '/api';

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

let currentPostId = null;

// Fetch feed
async function loadFeed() {
  try {
    const res = await fetch(`${API}/feed`);
    const posts = await res.json();
    renderFeed(posts);
  } catch (err) {
    emptyState.textContent = 'Could not load feed. Make sure the server is running.';
  }
}

function renderFeed(posts) {
  if (!posts?.length) {
    emptyState.textContent = 'No posts yet. Be the first to share.';
    emptyState.style.display = 'block';
    feedEl.innerHTML = '';
    return;
  }
  emptyState.style.display = 'none';
  feedEl.innerHTML = posts.map((p) => postToHTML(p)).join('');

  // Attach event listeners
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
  return `
    <article class="post-card" data-id="${p.id}">
      <div class="post-header">
        <span class="post-avatar">${escapeHtml(p.avatar)}</span>
        <div class="post-meta">
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="handle">@${escapeHtml(p.username)}</span>
          <span class="time">${time}</span>
        </div>
      </div>
      <div class="post-content">${escapeHtml(p.content)}</div>
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
    const res = await fetch(`${API}/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${API}/posts/${postId}/comments`);
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
      <span class="comment-avatar">${escapeHtml(c.avatar)}</span>
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
    const res = await fetch(`${API}/posts/${currentPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  if (!content) return;
  try {
    const res = await fetch(`${API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
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
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
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

// Init
loadFeed();
