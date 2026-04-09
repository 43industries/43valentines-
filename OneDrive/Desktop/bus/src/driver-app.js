import { getSupabase, isSupabaseConfigured } from './supabase.js';

const DRIVER_FUNCTION_URL = import.meta.env.VITE_DRIVER_FUNCTION_URL || '';

let supabaseClient = null;
let watchId = null;

function initSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (supabaseClient) return supabaseClient;
  supabaseClient = getSupabase();
  return supabaseClient;
}

const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusBox = document.getElementById('status-box');
const statusLine = document.getElementById('status-line');
const liveDot = document.getElementById('live-dot');
const liveLabel = document.getElementById('live-label');

function setStatus(main, detail) {
  const strong = statusBox?.querySelector('strong');
  if (strong) strong.textContent = `Status: ${main}`;
  if (statusLine) statusLine.textContent = detail || '';
}

function setLive(isOn) {
  if (isOn) {
    liveDot?.classList.add('live');
    if (liveLabel) liveLabel.textContent = 'ON · Sharing location';
  } else {
    liveDot?.classList.remove('live');
    if (liveLabel) liveLabel.textContent = 'OFF · Not sharing';
  }
}

async function handleLogin() {
  const c = initSupabase();
  if (!c) {
    setStatus('Error', 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
    return;
  }
  const email = (document.getElementById('email').value || '').trim();
  const password = (document.getElementById('password').value || '').trim();
  if (!email || !password) {
    setStatus('Error', 'Enter both email and password.');
    return;
  }
  loginBtn.disabled = true;
  setStatus('Logging in…', 'Checking your credentials with BusBuddy.');
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  loginBtn.disabled = false;
  if (error) {
    console.error(error);
    setStatus('Error', error.message || 'Could not log in.');
    return;
  }
  logoutBtn.disabled = false;
  startBtn.disabled = false;
  setStatus(
    'Logged in',
    `Welcome ${data.user?.email || ''}. You can now start sharing.`,
  );
}

async function handleLogout() {
  const c = initSupabase();
  if (!c) return;
  await c.auth.signOut();
  stopSharing();
  logoutBtn.disabled = true;
  startBtn.disabled = true;
  setStatus('Not logged in', 'You have been logged out.');
}

async function sendLocation(lat, lng, speed) {
  const c = initSupabase();
  if (!c) return;
  const { data: sessionData } = await c.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    setStatus('Error', 'No active session. Please log in again.');
    stopSharing();
    return;
  }
  if (!DRIVER_FUNCTION_URL) {
    setStatus('Error', 'Set VITE_DRIVER_FUNCTION_URL in .env.local.');
    stopSharing();
    return;
  }
  try {
    const res = await fetch(DRIVER_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lat,
        lng,
        speed_kmh: speed || null,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Function error', res.status, text);
      setStatus('Warning', 'Could not send update, will retry on next position.');
    } else {
      const json = await res.json().catch(() => ({}));
      setStatus(
        'Sharing',
        `Last update at ${json.recorded_at || new Date().toISOString()}`,
      );
    }
  } catch (e) {
    console.error(e);
    setStatus('Warning', 'Network error while sending location.');
  }
}

function startSharing() {
  if (!navigator.geolocation) {
    setStatus('Error', 'Geolocation is not supported on this device.');
    return;
  }
  if (watchId !== null) return;
  setStatus('Requesting location…', 'Please allow location access when prompted.');
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, speed } = pos.coords;
      setLive(true);
      sendLocation(latitude, longitude, speed ? speed * 3.6 : null);
    },
    (err) => {
      console.error(err);
      setStatus('Error', err.message || 'Could not read GPS.');
      stopSharing();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    },
  );
  startBtn.disabled = true;
  stopBtn.disabled = false;
}

function stopSharing() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  setLive(false);
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

loginBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  handleLogin();
});
logoutBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  handleLogout();
});
startBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  startSharing();
});
stopBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  stopSharing();
});
