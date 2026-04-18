import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { resolveTenantContext } from './session.js';

const BUS_ID = import.meta.env.VITE_DEFAULT_BUS_ID || 'bus_07';

let supabaseClient = null;
let map = null;
let marker = null;
let driverPhone = '+254700000000';
let schoolId = null;
let activeBusId = BUS_ID;

function initSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClient) supabaseClient = getSupabase();
  return supabaseClient;
}

function busLabel() {
  return activeBusId === 'bus_07' ? 'Bus 07' : activeBusId;
}

function toast(msg) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

window.callDriver = function callDriver() {
  window.location.href = `tel:${driverPhone.replace(/\s/g, '')}`;
};

window.toast = toast;

function initMap() {
  if (map || typeof L === 'undefined') return;
  map = L.map('map', { zoomControl: true }).setView([-1.286389, 36.817223], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function applyBusMeta(meta) {
  if (!meta) return;
  const title = document.getElementById('track-bus-title');
  const routeChip = document.getElementById('track-route-chip');
  const initials = document.getElementById('track-driver-initials');
  const nameEl = document.getElementById('track-driver-name');
  const subEl = document.getElementById('track-driver-sub');
  if (title) {
    title.textContent = `${busLabel()} · ${meta.school_name || 'School'}`;
  }
  if (routeChip) routeChip.textContent = meta.route_label || 'Route';
  if (initials) initials.textContent = meta.driver_initials || '—';
  if (nameEl) nameEl.textContent = meta.driver_name || '—';
  if (subEl) {
    subEl.textContent = [meta.plate, busLabel(), 'Senior driver'].filter(Boolean).join(' · ');
  }
  if (meta.phone_e164) driverPhone = meta.phone_e164;
}

async function loadBusMeta() {
  const client = initSupabase();
  if (!client || !schoolId) return;
  const { data } = await client
    .from('bus_meta')
    .select('*')
    .eq('school_id', schoolId)
    .eq('bus_id', activeBusId)
    .maybeSingle();
  applyBusMeta(data);
}

function updateUIFromState(row) {
  if (!row || row.lat == null || row.lng == null) return;
  if (row.school_id && schoolId && row.school_id !== schoolId) return;
  if (row.bus_id && row.bus_id !== activeBusId) return;
  initMap();
  if (!map) return;

  const pos = [row.lat, row.lng];
  if (!marker) {
    marker = L.marker(pos, { title: activeBusId }).addTo(map);
  } else {
    marker.setLatLng(pos);
  }
  map.panTo(pos, { animate: true });

  const recordedAt = row.recorded_at ? new Date(row.recorded_at) : null;
  const speed = typeof row.speed_kmh === 'number' ? row.speed_kmh : null;
  const etaMin =
    typeof row.next_stop_eta_minutes === 'number'
      ? row.next_stop_eta_minutes
      : null;

  const statusTextMain = document.getElementById('status-text-main');
  const liveDotMain = document.getElementById('live-dot-main');
  const statusLabel = document.getElementById('status-label');
  const lastUpdated = document.getElementById('last-updated');
  const chipSpeed = document.getElementById('chip-speed');
  const metricSpeed = document.getElementById('metric-speed');
  const metricDistance = document.getElementById('metric-distance');
  const chipEta = document.getElementById('chip-eta');

  if (recordedAt) {
    const now = new Date();
    const diffMin = Math.round((now - recordedAt) / 60000);
    const freshness = diffMin <= 2 ? 'Live' : `Updated ${diffMin} min ago`;
    if (statusTextMain) {
      statusTextMain.textContent = `${busLabel()} · ${freshness}`;
    }
    if (lastUpdated) lastUpdated.textContent = recordedAt.toLocaleTimeString();
  }
  if (speed !== null) {
    if (chipSpeed) chipSpeed.textContent = `Speed: ${Math.round(speed)} km/h`;
    if (metricSpeed) metricSpeed.textContent = `${Math.round(speed)} km/h`;
  }

  const schoolLat = -1.283;
  const schoolLng = 36.82;
  const distKm = haversineKm(row.lat, row.lng, schoolLat, schoolLng);
  if (metricDistance) metricDistance.textContent = `${distKm.toFixed(1)} km`;

  if (chipEta) {
    if (etaMin != null && etaMin >= 0) {
      chipEta.textContent =
        etaMin === 0 ? 'ETA: arriving' : `ETA: approx ${etaMin} min`;
    } else if (speed && speed > 5) {
      const etaMinutes = Math.max(3, Math.round((distKm / speed) * 60));
      chipEta.textContent = `ETA: approx ${etaMinutes} min`;
    } else {
      chipEta.textContent = 'ETA: bus stationary';
    }
  }

  if (statusLabel) statusLabel.textContent = 'On route to school';
  if (liveDotMain) {
    liveDotMain.style.background = '#22C55E';
    liveDotMain.style.boxShadow = '0 0 0 6px rgba(34,197,94,0.5)';
  }
}

async function bootstrap() {
  initMap();
  const client = initSupabase();
  if (!client) {
    toast('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
    return;
  }

  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    toast('Sign in from the dashboard first, then open the live map.');
    return;
  }

  const ctx = await resolveTenantContext(client);
  if (!ctx) {
    toast('This account has no school access.');
    return;
  }

  schoolId = ctx.schoolId;
  if (ctx.mode === 'parent' && ctx.parentProfile?.students) {
    activeBusId = ctx.parentProfile.students.bus_id;
  } else {
    activeBusId = BUS_ID;
  }

  await loadBusMeta();

  try {
    const { data, error } = await client
      .from('bus_state')
      .select('*')
      .eq('school_id', schoolId)
      .eq('bus_id', activeBusId)
      .maybeSingle();
    if (!error && data) updateUIFromState(data);
  } catch (e) {
    console.warn('Failed to load initial bus_state', e);
    toast('Could not load initial bus position.');
  }

  client
    .channel(`track_bus_state_${schoolId}_${activeBusId}`)
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
        updateUIFromState(row);
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') toast('Live updates connected.');
    });
}

window.addEventListener('load', bootstrap);
