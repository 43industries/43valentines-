import { getSupabase, isSupabaseConfigured } from './supabase.js';

const BUS_ID = import.meta.env.VITE_DEFAULT_BUS_ID || 'bus_07';

let supabaseClient = null;
let leafletMap = null;
let busMarker = null;
let activeBusId = BUS_ID;
let busChannel = null;
let studentsChannel = null;
let notifChannel = null;
let routeChannel = null;
let metaChannel = null;

let studentsCache = [];
let currentStudent = null;
let currentLeg = 'to_pickup';

const DEMO_ALERT_ROTATION = [
  {
    category: 'n-green',
    icon: '✅',
    message: 'Mercy Jebet has safely boarded at Westlands! 🎉',
  },
  {
    category: 'n-blue',
    icon: '📍',
    message: 'Bus 07 arrived at Westlands Mall stop.',
  },
  {
    category: 'n-green',
    icon: '✅',
    message: 'Tom Barasa boarded the bus.',
  },
  {
    category: 'n-orange',
    icon: '⏱️',
    message: 'Bus 07 is 2 min behind — ETA updated.',
  },
];
let demoAlertIndex = 0;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (supabaseClient) return supabaseClient;
  supabaseClient = getSupabase();
  return supabaseClient;
}

function initRealtimeMap() {
  const el = document.getElementById('realtime-map');
  if (!el || leafletMap || typeof L === 'undefined') return;
  leafletMap = L.map(el, { zoomControl: false }).setView([-1.286389, 36.817223], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(leafletMap);
}

function updateBusPosition(lat, lng, speedKmh, recordedAt, nextEtaMin) {
  if (!leafletMap) initRealtimeMap();
  if (!leafletMap) return;

  const pos = [lat, lng];
  if (!busMarker) {
    busMarker = L.marker(pos, { title: activeBusId }).addTo(leafletMap);
  } else {
    busMarker.setLatLng(pos);
  }
  leafletMap.panTo(pos, { animate: true });

  const speedLbl = document.getElementById('speed-lbl');
  const mapSpeed = document.getElementById('map-speed');
  const liveDot = document.getElementById('live-dot');
  const liveLabel = document.getElementById('live-status-label');
  const vEta = document.getElementById('v-eta');

  if (speedLbl) {
    speedLbl.textContent =
      typeof speedKmh === 'number' && !Number.isNaN(speedKmh)
        ? `${Math.round(speedKmh)} km/h`
        : '—';
  }
  if (mapSpeed) {
    mapSpeed.textContent =
      typeof speedKmh === 'number' && !Number.isNaN(speedKmh)
        ? `${Math.round(speedKmh)} km/h`
        : '—';
  }
  if (liveDot) liveDot.style.background = '#66BB6A';
  if (liveLabel && recordedAt) {
    const busLabel = activeBusId === BUS_ID ? 'Bus 07' : activeBusId;
    liveLabel.textContent = `${busLabel} · Live · ${new Date(recordedAt).toLocaleTimeString()}`;
  }

  if (vEta) {
    if (typeof nextEtaMin === 'number' && nextEtaMin > 0) {
      vEta.textContent = `${nextEtaMin} min`;
    } else if (typeof nextEtaMin === 'number' && nextEtaMin === 0) {
      vEta.textContent = 'Arriving';
    }
  }
  syncParentEtaFromCard();
}

async function bootstrapBusTracking(busId) {
  const client = initSupabase();
  if (!client) return;

  activeBusId = busId || BUS_ID;

  try {
    const { data, error } = await client
      .from('bus_state')
      .select('*')
      .eq('bus_id', activeBusId)
      .maybeSingle();
    if (!error && data && data.lat != null && data.lng != null) {
      updateBusPosition(
        data.lat,
        data.lng,
        data.speed_kmh,
        data.recorded_at,
        data.next_stop_eta_minutes,
      );
    }
  } catch (e) {
    console.warn('Failed to load initial bus_state', e);
  }

  if (busChannel) client.removeChannel(busChannel);

  busChannel = client
    .channel(`bus_state_changes_${activeBusId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bus_state',
        filter: `bus_id=eq.${activeBusId}`,
      },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row || row.lat == null || row.lng == null) return;
        updateBusPosition(
          row.lat,
          row.lng,
          row.speed_kmh,
          row.recorded_at,
          row.next_stop_eta_minutes,
        );
      },
    )
    .subscribe();
}

function updateHeroFromStudents(rows) {
  const aboard = rows.filter((s) => s.status === 'on').length;
  const dropped = rows.filter((s) => s.status === 'drop').length;
  const absent = rows.filter((s) => s.status === 'abs').length;
  const elOn = document.getElementById('v-students-aboard');
  const elDrop = document.getElementById('v-dropped');
  const elAbs = document.getElementById('v-absent');
  const totalEl = document.getElementById('student-total');
  if (elOn) elOn.textContent = String(aboard);
  if (elDrop) elDrop.textContent = String(dropped);
  if (elAbs) elAbs.textContent = String(absent);
  if (totalEl) totalEl.textContent = `${rows.length} total`;
}

const stLabel = {
  on: 'Aboard 🟢',
  wait: 'Waiting ⏳',
  abs: 'Absent ❌',
  drop: 'Dropped ✅',
};
const stClass = {
  on: 'sb-on',
  wait: 'sb-wait',
  abs: 'sb-abs',
  drop: 'sb-drop',
};

function renderStudentsList(list) {
  const wrap = document.getElementById('student-list');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML =
      '<div class="student-row" style="justify-content:center;color:var(--text-soft);font-weight:600;">No students match your search.</div>';
    return;
  }
  wrap.innerHTML = list
    .map(
      (s) => `
    <div class="student-row">
      <div class="s-avatar" style="background:${escapeHtml(s.avatar_color)}">${escapeHtml(s.avatar_initials)}</div>
      <div><div class="s-name">${escapeHtml(s.full_name)}</div><div class="s-class">${escapeHtml(s.grade)}</div></div>
      <div class="s-badge ${stClass[s.status] || 'sb-wait'}">${stLabel[s.status] || s.status}</div>
    </div>`,
    )
    .join('');
}

function filterStudents(q) {
  const needle = (q || '').toLowerCase();
  renderStudentsList(
    studentsCache.filter((s) => s.full_name.toLowerCase().includes(needle)),
  );
}

async function loadStudents() {
  const client = initSupabase();
  if (!client) {
    studentsCache = [];
    renderStudentsList([]);
    return;
  }
  const { data, error } = await client
    .from('students')
    .select('*')
    .eq('bus_id', BUS_ID)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error(error);
    toast('Could not load students from the database.');
    return;
  }
  studentsCache = data || [];
  updateHeroFromStudents(studentsCache);
  filterStudents(
    document.querySelector('.search-box input')?.value || '',
  );
}

function subscribeStudents() {
  const client = initSupabase();
  if (!client) return;
  if (studentsChannel) client.removeChannel(studentsChannel);
  studentsChannel = client
    .channel(`students_${BUS_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'students',
        filter: `bus_id=eq.${BUS_ID}`,
      },
      () => {
        loadStudents();
      },
    )
    .subscribe();
}

function formatNotifTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  if (now - d < 120000) return 'Just now';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderNotifs(rows) {
  const el = document.getElementById('notif-list');
  if (!el) return;
  const slice = (rows || []).slice(0, 6);
  el.innerHTML = slice
    .map(
      (n) => `
    <div class="notif-row ${escapeHtml(n.category)}">
      <div class="notif-icon">${escapeHtml(n.icon || '•')}</div>
      <div><div class="notif-msg">${escapeHtml(n.message)}</div><div class="notif-ts">${escapeHtml(formatNotifTime(n.created_at))}</div></div>
    </div>`,
    )
    .join('');
}

async function loadNotifications() {
  const client = initSupabase();
  if (!client) {
    renderNotifs([]);
    return;
  }
  const { data, error } = await client
    .from('bus_notifications')
    .select('*')
    .eq('bus_id', BUS_ID)
    .order('created_at', { ascending: false })
    .limit(24);
  if (error) {
    console.error(error);
    return;
  }
  renderNotifs(data || []);
}

function subscribeNotifications() {
  const client = initSupabase();
  if (!client) return;
  if (notifChannel) client.removeChannel(notifChannel);
  notifChannel = client
    .channel(`bus_notifications_${BUS_ID}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bus_notifications',
        filter: `bus_id=eq.${BUS_ID}`,
      },
      () => loadNotifications(),
    )
    .subscribe();
}

function chipClass(v) {
  if (v === 'wait') return 'chip-wait';
  if (v === 'off') return 'chip-off';
  return 'chip-on';
}

function renderRouteStops(stops) {
  const wrap = document.getElementById('route-timeline');
  const titleEl = document.getElementById('route-card-title');
  if (titleEl) {
    titleEl.textContent = stops.length
      ? `Route — ${stops.length} Stops Today`
      : 'Route';
  }
  if (!wrap) return;
  if (!stops.length) {
    wrap.innerHTML =
      '<div style="padding:16px 22px;color:var(--text-soft);font-weight:600;">No route data yet.</div>';
    return;
  }

  wrap.innerHTML = stops
    .map((stop, idx) => {
      const isLast = idx === stops.length - 1;
      const dotClass =
        stop.state === 'done'
          ? 'rt-done'
          : stop.state === 'current'
            ? 'rt-current'
            : stop.state === 'school'
              ? 'rt-school'
              : 'rt-upcoming';
      let dotInner = '✓';
      if (stop.state === 'current') dotInner = '🚌';
      else if (stop.state === 'upcoming') dotInner = escapeHtml(stop.dot_label || String(idx + 1));
      else if (stop.state === 'school') dotInner = '🏫';

      const chips = Array.isArray(stop.chips) ? stop.chips : [];
      const chipsHtml = chips
        .map(
          (c) =>
            `<span class="chip ${chipClass(c.v)}">${escapeHtml(c.text || '')}</span>`,
        )
        .join('');

      const timeCls =
        stop.state === 'current' ? 'rt-time eta' : stop.state === 'done' ? 'rt-time done-t' : 'rt-time';
      const soft = 'style="color:var(--text-soft)"';
      const nameHtml =
        stop.state === 'current'
          ? `${escapeHtml(stop.name)} <span style="font-size:0.68rem;background:var(--bus-yellow);color:var(--navy);border-radius:8px;padding:2px 7px;margin-left:5px;font-weight:800;">NOW</span>`
          : stop.state === 'upcoming' || stop.state === 'school'
            ? `<span ${soft}>${escapeHtml(stop.name)}</span>`
            : escapeHtml(stop.name);

      return `
      <div class="rt-item">
        <div class="rt-dot ${dotClass}">${dotInner}</div>
        ${!isLast ? '<div class="rt-line"></div>' : ''}
        <div class="rt-content">
          <div class="rt-name">${nameHtml}</div>
          ${stop.subtitle ? `<div class="rt-sub">${escapeHtml(stop.subtitle)}</div>` : ''}
          ${stop.eta_note ? `<div class="rt-sub" style="color:var(--coral);font-weight:700">${escapeHtml(stop.eta_note)}</div>` : ''}
          <div class="rt-chips">${chipsHtml}</div>
        </div>
        <div class="${timeCls}">${escapeHtml(stop.scheduled_label || '')}</div>
      </div>`;
    })
    .join('');
}

async function loadRouteStops() {
  const client = initSupabase();
  if (!client) {
    renderRouteStops([]);
    return;
  }
  const { data, error } = await client
    .from('route_stops')
    .select('*')
    .eq('bus_id', BUS_ID)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  renderRouteStops(data || []);
}

function subscribeRouteStops() {
  const client = initSupabase();
  if (!client) return;
  if (routeChannel) client.removeChannel(routeChannel);
  routeChannel = client
    .channel(`route_stops_${BUS_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'route_stops',
        filter: `bus_id=eq.${BUS_ID}`,
      },
      () => loadRouteStops(),
    )
    .subscribe();
}

function applyBusMeta(meta) {
  if (!meta) return;
  const initials = document.getElementById('driver-display-initials');
  const nameEl = document.getElementById('driver-display-name');
  const plateLine = document.getElementById('driver-plate-line');
  const subLine = document.getElementById('driver-sub-line');
  if (initials) initials.textContent = meta.driver_initials || '—';
  if (nameEl) nameEl.textContent = meta.driver_name || '—';
  if (plateLine) {
    plateLine.textContent = [meta.plate, BUS_ID === 'bus_07' ? 'Bus 07' : BUS_ID]
      .filter(Boolean)
      .join(' · ');
  }
  if (subLine) {
    subLine.textContent = meta.school_name
      ? `Senior Driver · ${meta.school_name}`
      : 'Senior Driver';
  }
}

async function loadBusMeta() {
  const client = initSupabase();
  if (!client) return;
  const { data, error } = await client
    .from('bus_meta')
    .select('*')
    .eq('bus_id', BUS_ID)
    .maybeSingle();
  if (error) {
    console.warn(error);
    return;
  }
  applyBusMeta(data);
}

function subscribeBusMeta() {
  const client = initSupabase();
  if (!client) return;
  if (metaChannel) client.removeChannel(metaChannel);
  metaChannel = client
    .channel(`bus_meta_${BUS_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bus_meta',
        filter: `bus_id=eq.${BUS_ID}`,
      },
      (payload) => {
        applyBusMeta(payload.new);
      },
    )
    .subscribe();
}

function updateParentBanner(statusText) {
  const banner = document.getElementById('parent-banner');
  const statusEl = document.getElementById('banner-status');
  if (!banner || !statusEl) return;
  if (statusText) statusEl.textContent = statusText;
}

function syncParentEtaFromCard() {
  if (!currentStudent) return;
  const etaCard = document.getElementById('v-eta');
  const nextWrap = document.getElementById('parent-next');
  const stopEl = document.getElementById('parent-next-stop');
  const etaEl = document.getElementById('parent-next-eta');
  const legEl = document.getElementById('parent-next-leg');
  if (!etaCard || !nextWrap || !stopEl || !etaEl || !legEl) return;

  etaEl.textContent = etaCard.textContent || '—';
  stopEl.textContent = currentStudent.stopName || '—';
  legEl.textContent =
    currentLeg === 'to_pickup' ? 'to home pick‑up' : 'to school drop‑off';
  nextWrap.style.display = 'flex';
}

async function handleParentLogin(event) {
  event.preventDefault();
  const input = document.getElementById('admission-input');
  const errorEl = document.getElementById('login-error');
  if (!input) return;
  const admission = input.value.trim().toUpperCase();
  const client = initSupabase();

  if (!client) {
    if (errorEl) {
      errorEl.textContent =
        'App is not connected to the database. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.';
    }
    return;
  }

  const { data: profile, error } = await client
    .from('parent_profiles')
    .select('*, students(*)')
    .eq('admission_code', admission)
    .maybeSingle();

  if (error || !profile || !profile.students) {
    if (errorEl) {
      errorEl.textContent =
        'We could not find that admission number. Please check and try again.';
    }
    return;
  }

  const st = profile.students;
  currentStudent = {
    studentName: st.full_name,
    stopName: profile.stop_name || '',
    busId: st.bus_id,
    studentId: st.id,
  };
  if (errorEl) errorEl.textContent = '';

  const banner = document.getElementById('parent-banner');
  const loginOverlay = document.getElementById('parent-login');
  const nameSpan = document.getElementById('banner-student-name');
  const busSpan = document.getElementById('banner-bus-label');
  const navStatus = document.getElementById('nav-status-text');

  const busLabel = st.bus_id === BUS_ID ? 'Bus 07' : st.bus_id;
  if (nameSpan) nameSpan.textContent = st.full_name;
  if (busSpan) busSpan.textContent = busLabel;
  if (banner) banner.style.display = 'flex';
  if (loginOverlay) loginOverlay.classList.add('hidden');
  if (navStatus) {
    navStatus.textContent = `Tracking ${st.full_name} · ${profile.stop_name || ''} · Morning run (${busLabel})`;
  }
  currentLeg = 'to_pickup';
  updateParentBanner(
    'Bus will leave school, then head to your home stop for pick‑up.',
  );
  syncParentEtaFromCard();
  bootstrapBusTracking(st.bus_id);
  toast(`Signed in. Tracking ${st.full_name} on ${busLabel}.`);
}

function skipLogin() {
  const loginOverlay = document.getElementById('parent-login');
  if (loginOverlay) loginOverlay.classList.add('hidden');
}

async function fireNotif() {
  const client = initSupabase();
  if (client && demoAlertIndex < DEMO_ALERT_ROTATION.length) {
    const a = DEMO_ALERT_ROTATION[demoAlertIndex++];
    const { error } = await client.from('bus_notifications').insert({
      bus_id: BUS_ID,
      category: a.category,
      icon: a.icon,
      message: a.message,
    });
    if (error) console.error(error);
    if (currentStudent && a.message.includes(currentStudent.studentName)) {
      if (a.message.toLowerCase().includes('boarded')) {
        currentLeg = 'to_school';
        updateParentBanner('Your child is on the bus, heading to school.');
        syncParentEtaFromCard();
      }
    }
  } else if (!client) {
    toast('Connect Supabase to push alerts to the database.');
  } else {
    toast('Demo alert queue finished — add rows in Supabase or extend DEMO_ALERT_ROTATION.');
  }
  const el = document.getElementById('notif-count');
  if (el) el.textContent = String(parseInt(el.textContent || '0', 10) + 1);
}

const roleStatus = {
  parent: 'Bus 07 is LIVE · Route A · Morning Run',
  teacher: 'Bus 07 · Route A · Class overview',
  admin: 'All buses · Dashboard · 43industries',
};

function setRole(el, role) {
  document.querySelectorAll('.role-tab').forEach((t) => {
    t.className = 'role-tab';
    t.setAttribute('aria-pressed', 'false');
  });
  el.className = `role-tab active-${role}`;
  el.setAttribute('aria-pressed', 'true');
  const statusEl = document.getElementById('nav-status-text');
  if (statusEl) statusEl.textContent = roleStatus[role] || roleStatus.parent;
}

function toast(msg) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function confirmEmergency() {
  if (
    confirm(
      'Report emergency for Bus 07? School and parents will be notified.',
    )
  ) {
    toast('Emergency reported. Help is on the way.');
  }
}

window.handleParentLogin = handleParentLogin;
window.skipLogin = skipLogin;
window.filterStudents = filterStudents;
window.fireNotif = fireNotif;
window.setRole = setRole;
window.confirmEmergency = confirmEmergency;
window.toast = toast;

window.addEventListener('load', () => {
  initRealtimeMap();
  bootstrapBusTracking(BUS_ID);

  if (!isSupabaseConfigured()) {
    toast(
      'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then run npm run dev.',
    );
    document.getElementById('v-eta').textContent = '—';
    return;
  }

  initSupabase();
  loadStudents();
  subscribeStudents();
  loadNotifications();
  subscribeNotifications();
  loadRouteStops();
  subscribeRouteStops();
  loadBusMeta();
  subscribeBusMeta();
});
