import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { resolveTenantContext } from './session.js';

const BUS_ID = import.meta.env.VITE_DEFAULT_BUS_ID || 'bus_07';

let supabaseClient = null;
let leafletMap = null;
let busMarker = null;
let activeBusId = BUS_ID;
let schoolId = null;
let sessionMode = null;
let busChannel = null;
let studentsChannel = null;
let notifChannel = null;
let routeChannel = null;
let metaChannel = null;

let studentsCache = [];
let currentStudent = null;
let currentLeg = 'to_pickup';
let routeLabelFromMeta = 'Route A · Morning Run';
let staffRole = null;
let activePlatformTab = 'parent';
let parentNavLine = null;
let driverDial = '';

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
    const busLabel = busDisplayLabel();
    liveLabel.textContent = `${busLabel} · Live · ${new Date(recordedAt).toLocaleTimeString()}`;
  }

  if (vEta) {
    if (typeof nextEtaMin === 'number' && nextEtaMin > 0) {
      vEta.textContent = `${nextEtaMin} min`;
    } else if (typeof nextEtaMin === 'number' && nextEtaMin === 0) {
      vEta.textContent = 'Arriving';
    } else {
      vEta.textContent = '—';
    }
  }
  syncParentEtaFromCard();
}

async function bootstrapBusTracking(busId) {
  const client = initSupabase();
  if (!client || !schoolId) return;

  activeBusId = busId || BUS_ID;

  try {
    const { data, error } = await client
      .from('bus_state')
      .select('*')
      .eq('school_id', schoolId)
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
    .channel(`bus_state_${schoolId}_${activeBusId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bus_state',
        filter: `school_id=eq.${schoolId}`,
      },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row || row.lat == null || row.lng == null) return;
        if (row.bus_id !== activeBusId) return;
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
  if (!client || !schoolId) {
    studentsCache = [];
    renderStudentsList([]);
    return;
  }
  const { data, error } = await client
    .from('students')
    .select('*')
    .eq('school_id', schoolId)
    .eq('bus_id', activeBusId)
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
  if (!client || !schoolId) return;
  if (studentsChannel) client.removeChannel(studentsChannel);
  studentsChannel = client
    .channel(`students_${schoolId}_${activeBusId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'students',
        filter: `school_id=eq.${schoolId}`,
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
  if (!client || !schoolId) {
    renderNotifs([]);
    return;
  }
  const { data, error } = await client
    .from('bus_notifications')
    .select('*')
    .eq('school_id', schoolId)
    .eq('bus_id', activeBusId)
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
  if (!client || !schoolId) return;
  if (notifChannel) client.removeChannel(notifChannel);
  notifChannel = client
    .channel(`bus_notifications_${schoolId}_${activeBusId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bus_notifications',
        filter: `school_id=eq.${schoolId}`,
      },
      (payload) => {
        const row = payload.new;
        if (row && row.bus_id === activeBusId) loadNotifications();
      },
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
  if (!client || !schoolId) {
    renderRouteStops([]);
    return;
  }
  const { data, error } = await client
    .from('route_stops')
    .select('*')
    .eq('school_id', schoolId)
    .eq('bus_id', activeBusId)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  renderRouteStops(data || []);
}

function subscribeRouteStops() {
  const client = initSupabase();
  if (!client || !schoolId) return;
  if (routeChannel) client.removeChannel(routeChannel);
  routeChannel = client
    .channel(`route_stops_${schoolId}_${activeBusId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'route_stops',
        filter: `school_id=eq.${schoolId}`,
      },
      (payload) => {
        const row = payload.new || payload.old;
        if (row && row.bus_id === activeBusId) loadRouteStops();
      },
    )
    .subscribe();
}

function busDisplayLabel() {
  return activeBusId === 'bus_07' ? 'Bus 07' : activeBusId;
}

function defaultNavStatusLine() {
  return `${busDisplayLabel()} is LIVE · ${routeLabelFromMeta}`;
}

function applyBusMeta(meta) {
  if (!meta) {
    driverDial = '';
    return;
  }
  if (meta.route_label) routeLabelFromMeta = meta.route_label;
  const initials = document.getElementById('driver-display-initials');
  const nameEl = document.getElementById('driver-display-name');
  const plateLine = document.getElementById('driver-plate-line');
  const subLine = document.getElementById('driver-sub-line');
  if (initials) initials.textContent = meta.driver_initials || '—';
  if (nameEl) nameEl.textContent = meta.driver_name || '—';
  if (plateLine) {
    plateLine.textContent = [meta.plate, busDisplayLabel()]
      .filter(Boolean)
      .join(' · ');
  }
  if (subLine) {
    subLine.textContent = meta.school_name
      ? `Senior Driver · ${meta.school_name}`
      : 'Senior Driver';
  }
  driverDial = (meta.phone_e164 && String(meta.phone_e164).trim()) || '';
  const nav = document.getElementById('nav-status-text');
  if (nav && !currentStudent) nav.textContent = defaultNavStatusLine();
}

async function loadBusMeta() {
  const client = initSupabase();
  if (!client || !schoolId) return;
  const { data, error } = await client
    .from('bus_meta')
    .select('*')
    .eq('school_id', schoolId)
    .eq('bus_id', activeBusId)
    .maybeSingle();
  if (error) {
    console.warn(error);
    return;
  }
  applyBusMeta(data || null);
}

function subscribeBusMeta() {
  const client = initSupabase();
  if (!client || !schoolId) return;
  if (metaChannel) client.removeChannel(metaChannel);
  metaChannel = client
    .channel(`bus_meta_${schoolId}_${activeBusId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bus_meta',
        filter: `school_id=eq.${schoolId}`,
      },
      (payload) => {
        const row = payload.new || payload.old;
        if (row && row.bus_id === activeBusId) applyBusMeta(payload.new);
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
  if (!currentStudent || activePlatformTab !== 'parent') return;
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

function showLoginOverlay() {
  document.getElementById('parent-login')?.classList.remove('hidden');
}

function hideLoginOverlay() {
  document.getElementById('parent-login')?.classList.add('hidden');
}

function updateStaffOnlyUi() {
  document.querySelectorAll('[data-staff-only]').forEach((el) => {
    el.style.display = sessionMode === 'staff' ? '' : 'none';
  });
}

function applyAuthContext(ctx) {
  schoolId = ctx.schoolId;
  sessionMode = ctx.mode;
  staffRole = ctx.staffRole || null;
  parentNavLine = null;

  const pill = document.getElementById('user-pill');
  if (pill && ctx.user?.email) {
    pill.textContent = `${ctx.user.email.split('@')[0]} · Sign out`;
  }

  updateStaffOnlyUi();

  if (ctx.mode === 'parent' && ctx.parentProfile?.students) {
    const profile = ctx.parentProfile;
    const st = profile.students;
    currentStudent = {
      studentName: st.full_name,
      stopName: profile.stop_name || '',
      busId: st.bus_id,
      studentId: st.id,
    };
    activeBusId = st.bus_id;

    const nameSpan = document.getElementById('banner-student-name');
    const busSpan = document.getElementById('banner-bus-label');
    const bl = st.bus_id === 'bus_07' ? 'Bus 07' : st.bus_id;
    if (nameSpan) nameSpan.textContent = st.full_name;
    if (busSpan) busSpan.textContent = bl;
    parentNavLine = `Tracking ${st.full_name} · ${profile.stop_name || ''} · Morning run (${bl})`;
    currentLeg = 'to_pickup';
    updateParentBanner(
      'Bus will leave school, then head to your home stop for pick‑up.',
    );
  } else {
    currentStudent = null;
    activeBusId = BUS_ID;
    const pb = document.getElementById('parent-banner');
    const pn = document.getElementById('parent-next');
    const pqa = document.getElementById('parent-quick-actions');
    if (pb) pb.style.display = 'none';
    if (pn) pn.style.display = 'none';
    if (pqa) pqa.style.display = 'none';
  }
}

function canPostAlerts() {
  return (
    sessionMode === 'staff' &&
    staffRole &&
    ['school_admin', 'driver', 'staff_viewer'].includes(staffRole)
  );
}

function canUpdateStudentAttendance() {
  return canPostAlerts();
}

function applyPlatformTab(role) {
  activePlatformTab = role;
  if (document.body) document.body.dataset.platform = role;

  const adminConsole = document.getElementById('admin-console');
  if (adminConsole) {
    adminConsole.style.display =
      role === 'admin' && sessionMode === 'staff' ? 'block' : 'none';
  }

  const banner = document.getElementById('parent-banner');
  const nextWrap = document.getElementById('parent-next');
  const parentActions = document.getElementById('parent-quick-actions');
  const showParentUi = role === 'parent' && currentStudent;
  if (banner) banner.style.display = showParentUi ? 'flex' : 'none';
  if (nextWrap) nextWrap.style.display = showParentUi ? 'flex' : 'none';
  if (parentActions) parentActions.style.display = showParentUi ? 'flex' : 'none';
  if (showParentUi) syncParentEtaFromCard();

  const titleEl = document.getElementById('student-card-title');
  if (titleEl) {
    const bl = busDisplayLabel();
    if (role === 'teacher') titleEl.textContent = `Students — ${bl} (teacher roster)`;
    else if (role === 'admin') titleEl.textContent = `Students — ${bl} (school admin)`;
    else
      titleEl.textContent = currentStudent
        ? `Students — ${bl} (your child’s bus)`
        : `Students — ${bl}`;
  }

  const statusEl = document.getElementById('nav-status-text');
  if (statusEl) {
    if (role === 'parent') {
      if (currentStudent && parentNavLine) statusEl.textContent = parentNavLine;
      else statusEl.textContent = defaultNavStatusLine();
    } else if (role === 'teacher') {
      statusEl.textContent = `${busDisplayLabel()} · ${routeLabelFromMeta} · Teacher platform`;
    } else if (role === 'admin') {
      statusEl.textContent = `${busDisplayLabel()} · ${routeLabelFromMeta} · Admin platform`;
    } else {
      statusEl.textContent = defaultNavStatusLine();
    }
  }

  if (role === 'admin' && sessionMode === 'staff') void loadAdminPanelStats();
}

function initDefaultPlatformTab() {
  const tab = sessionMode === 'staff' ? 'teacher' : 'parent';
  const btn = document.querySelector(`.role-tab[data-platform="${tab}"]`);
  document.querySelectorAll('.role-tab').forEach((t) => {
    t.className = 'role-tab';
    t.setAttribute('aria-pressed', 'false');
  });
  if (btn && btn.offsetParent !== null) {
    btn.className = `role-tab active-${tab}`;
    btn.setAttribute('aria-pressed', 'true');
  } else {
    const parentBtn = document.querySelector('.role-tab[data-platform="parent"]');
    if (parentBtn) {
      parentBtn.className = 'role-tab active-parent';
      parentBtn.setAttribute('aria-pressed', 'true');
    }
    applyPlatformTab('parent');
    return;
  }
  applyPlatformTab(tab);
}

async function loadAdminPanelStats() {
  const client = initSupabase();
  const nameEl = document.getElementById('admin-school-name');
  const busEl = document.getElementById('admin-bus-count');
  const stuEl = document.getElementById('admin-student-count');
  const actEl = document.getElementById('admin-active-bus');
  if (!client || !schoolId || sessionMode !== 'staff') return;

  const { data: sch } = await client
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .maybeSingle();
  if (nameEl && sch?.name) nameEl.textContent = sch.name;

  const { count: busCount, error: e1 } = await client
    .from('bus_meta')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId);
  const { count: stuCount, error: e2 } = await client
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId);
  if (e1) console.warn(e1);
  if (e2) console.warn(e2);
  if (busEl) busEl.textContent = busCount != null ? String(busCount) : '—';
  if (stuEl) stuEl.textContent = stuCount != null ? String(stuCount) : '—';
  if (actEl) actEl.textContent = busDisplayLabel();
}

function openSupabaseDashboardHint() {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (m) {
    window.open(`https://supabase.com/dashboard/project/${m[1]}`, '_blank');
  } else {
    toast(
      'Configure VITE_SUPABASE_URL with your *.supabase.co URL to open the project dashboard.',
    );
  }
}

async function parentReportAbsence() {
  if (sessionMode !== 'parent' || !currentStudent?.studentId) {
    toast('Sign in as a parent linked to a student to report absence.');
    return;
  }
  const client = initSupabase();
  if (!client) return;
  const { error } = await client.rpc('parent_set_transport_status', {
    p_student_id: currentStudent.studentId,
    p_status: 'abs',
  });
  if (error) {
    console.error(error);
    toast(
      error.message ||
        'Could not update status. Run the latest Supabase migration (parent_set_transport_status).',
    );
    return;
  }
  toast('Absence reported. The school and driver will see your child as absent for this run.');
  await loadStudents();
}

async function parentMarkWaiting() {
  if (sessionMode !== 'parent' || !currentStudent?.studentId) {
    toast('Sign in as a parent linked to a student.');
    return;
  }
  const client = initSupabase();
  if (!client) return;
  const { error } = await client.rpc('parent_set_transport_status', {
    p_student_id: currentStudent.studentId,
    p_status: 'wait',
  });
  if (error) {
    console.error(error);
    toast(error.message || 'Could not update status.');
    return;
  }
  toast('Status set to waiting. Staff can see the update on the roster.');
  await loadStudents();
}

function callDriverFromMeta() {
  const tel = driverDial.replace(/\s/g, '');
  if (tel) window.location.href = `tel:${tel}`;
  else
    toast(
      'No driver phone on file. Set phone_e164 on bus_meta in Supabase for this bus.',
    );
}

function openSmsToParents() {
  if (sessionMode !== 'staff') {
    toast('Staff use this to draft an SMS to families. Parents see alerts in the live feed.');
    return;
  }
  const body = encodeURIComponent(
    `Bus update (${busDisplayLabel()} — ${routeLabelFromMeta}): `,
  );
  window.open(`sms:?body=${body}`, '_blank');
  toast('SMS app opened with a draft. Add recipients from your school directory.');
}

async function openAttendanceModal() {
  const modal = document.getElementById('attendance-modal');
  const body = document.getElementById('attendance-modal-body');
  if (!modal || !body) return;
  await loadStudents();
  const readonly = !canUpdateStudentAttendance();
  if (!studentsCache.length) {
    body.innerHTML =
      '<p style="font-weight:600;color:var(--text-soft);">No students on this bus.</p>';
  } else {
    body.innerHTML = studentsCache
      .map((s) => {
        const opts = ['on', 'wait', 'abs', 'drop']
          .map(
            (v) =>
              `<option value="${v}"${s.status === v ? ' selected' : ''}>${escapeHtml(stLabel[v] || v)}</option>`,
          )
          .join('');
        return `<div class="attendance-row">
      <div><strong>${escapeHtml(s.full_name)}</strong><div style="font-size:0.75rem;color:var(--text-soft)">${escapeHtml(s.grade)}</div></div>
      <select data-student-id="${escapeHtml(s.id)}" ${readonly ? 'disabled' : ''}>${opts}</select>
    </div>`;
      })
      .join('');
    body.querySelectorAll('select[data-student-id]').forEach((sel) => {
      sel.addEventListener('change', () => void onAttendanceChange(sel));
    });
  }
  modal.classList.remove('hidden');
}

function closeAttendanceModal() {
  document.getElementById('attendance-modal')?.classList.add('hidden');
}

async function onAttendanceChange(selectEl) {
  const id = selectEl.getAttribute('data-student-id');
  const status = selectEl.value;
  if (!id || !canUpdateStudentAttendance()) return;
  const client = initSupabase();
  if (!client || !schoolId) return;
  const { error } = await client
    .from('students')
    .update({ status })
    .eq('id', id)
    .eq('school_id', schoolId);
  if (error) {
    console.error(error);
    toast(error.message || 'Could not update attendance.');
    await loadStudents();
    return;
  }
  toast('Attendance saved.');
  await loadStudents();
}

function startDataSubscriptions() {
  bootstrapBusTracking(activeBusId);
  loadStudents();
  subscribeStudents();
  loadNotifications();
  subscribeNotifications();
  loadRouteStops();
  subscribeRouteStops();
  loadBusMeta();
  subscribeBusMeta();
}

async function handleSessionLogin(event) {
  event.preventDefault();
  const email = (document.getElementById('login-email')?.value || '').trim();
  const password = document.getElementById('login-password')?.value || '';
  const errorEl = document.getElementById('login-error');
  const client = initSupabase();

  if (!client) {
    if (errorEl) {
      errorEl.textContent =
        'App is not connected to the database. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.';
    }
    return;
  }
  if (!email || !password) {
    if (errorEl) errorEl.textContent = 'Enter email and password.';
    return;
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (errorEl) errorEl.textContent = error.message || 'Sign-in failed.';
    return;
  }

  const ctx = await resolveTenantContext(client);
  if (!ctx) {
    await client.auth.signOut();
    if (errorEl) {
      errorEl.textContent =
        'This account is not linked to a school. Ask your administrator to add you as staff or parent.';
    }
    return;
  }

  if (errorEl) errorEl.textContent = '';
  applyAuthContext(ctx);
  hideLoginOverlay();
  startDataSubscriptions();
  initDefaultPlatformTab();
  toast(`Signed in as ${ctx.mode === 'parent' ? 'parent' : 'school staff'}.`);
}

async function signOut() {
  const c = initSupabase();
  if (c) await c.auth.signOut();
  window.location.reload();
}

async function fireNotif() {
  if (!canPostAlerts()) {
    toast(
      sessionMode === 'parent'
        ? 'Alerts appear here when staff post them. Parents are notified in this feed.'
        : 'Your account cannot post simulated alerts. Use a driver, teacher, or admin login.',
    );
    return;
  }
  const client = initSupabase();
  if (client && schoolId && demoAlertIndex < DEMO_ALERT_ROTATION.length) {
    const a = DEMO_ALERT_ROTATION[demoAlertIndex++];
    const { error } = await client.from('bus_notifications').insert({
      school_id: schoolId,
      bus_id: activeBusId,
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
  } else if (!client || !schoolId) {
    toast('Sign in and connect Supabase to push alerts.');
  } else {
    toast('Demo alert queue finished — add rows in Supabase or extend DEMO_ALERT_ROTATION.');
  }
  const el = document.getElementById('notif-count');
  if (el) el.textContent = String(parseInt(el.textContent || '0', 10) + 1);
}

function setRole(el, role) {
  document.querySelectorAll('.role-tab').forEach((t) => {
    t.className = 'role-tab';
    t.setAttribute('aria-pressed', 'false');
  });
  if (el) {
    el.className = `role-tab active-${role}`;
    el.setAttribute('aria-pressed', 'true');
  }
  applyPlatformTab(role);
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

async function confirmEmergency() {
  const bl = busDisplayLabel();
  if (
    !confirm(
      `Report emergency for ${bl}? This posts a live alert to the bus feed for your school.`,
    )
  ) {
    return;
  }
  const client = initSupabase();
  if (!client || !schoolId || !canPostAlerts()) {
    toast(
      'Only operational staff can post an emergency to the database. Contact the driver or office.',
    );
    return;
  }
  const { error } = await client.from('bus_notifications').insert({
    school_id: schoolId,
    bus_id: activeBusId,
    category: 'n-orange',
    icon: '🚨',
    message: `EMERGENCY — ${bl}. Coordinators: follow protocol and contact families.`,
  });
  if (error) {
    console.error(error);
    toast(error.message || 'Could not post emergency alert.');
    return;
  }
  toast('Emergency alert posted to the live feed.');
}

window.handleSessionLogin = handleSessionLogin;
window.signOut = signOut;
window.filterStudents = filterStudents;
window.fireNotif = fireNotif;
window.setRole = setRole;
window.confirmEmergency = confirmEmergency;
window.toast = toast;
window.callDriverFromMeta = callDriverFromMeta;
window.openSmsToParents = openSmsToParents;
window.openSupabaseDashboardHint = openSupabaseDashboardHint;
window.openAttendanceModal = openAttendanceModal;
window.closeAttendanceModal = closeAttendanceModal;
window.parentReportAbsence = parentReportAbsence;
window.parentMarkWaiting = parentMarkWaiting;

window.addEventListener('load', async () => {
  initRealtimeMap();

  if (!isSupabaseConfigured()) {
    toast(
      'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then run npm run dev.',
    );
    document.getElementById('v-eta').textContent = '—';
    return;
  }

  initSupabase();
  const client = initSupabase();
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    showLoginOverlay();
    return;
  }

  const ctx = await resolveTenantContext(client);
  if (!ctx) {
    await client.auth.signOut();
    showLoginOverlay();
    toast('Session is not linked to any school. Contact your administrator.');
    return;
  }

  applyAuthContext(ctx);
  hideLoginOverlay();
  startDataSubscriptions();
  initDefaultPlatformTab();

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.reload();
  });
});
