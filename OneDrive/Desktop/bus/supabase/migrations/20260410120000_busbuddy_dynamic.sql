-- Core live row (may already exist on your project)
create table if not exists public.bus_state (
  bus_id text primary key,
  lat double precision,
  lng double precision,
  speed_kmh numeric,
  recorded_at timestamptz default now()
);

alter table public.bus_state
  add column if not exists next_stop_eta_minutes integer;

-- Students on a bus (status drives list + hero counts)
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  bus_id text not null,
  full_name text not null,
  grade text not null,
  status text not null check (status in ('on', 'wait', 'abs', 'drop')),
  avatar_initials text not null default '??',
  avatar_color text not null default '#64748b',
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create index if not exists students_bus_id_idx on public.students (bus_id);

-- Parent login lookup (admission code → student)
create table if not exists public.parent_profiles (
  id uuid primary key default gen_random_uuid(),
  admission_code text not null unique,
  student_id uuid not null references public.students (id) on delete cascade,
  parent_display_name text,
  stop_name text
);

-- Timeline alerts (dashboard “Live Alerts”)
create table if not exists public.bus_notifications (
  id uuid primary key default gen_random_uuid(),
  bus_id text not null,
  category text not null,
  icon text,
  message text not null,
  created_at timestamptz default now()
);

create index if not exists bus_notifications_bus_created_idx
  on public.bus_notifications (bus_id, created_at desc);

-- Route stops for the left-hand timeline
create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  bus_id text not null,
  sort_order int not null,
  name text not null,
  subtitle text,
  scheduled_label text,
  state text not null check (state in ('done', 'current', 'upcoming', 'school')),
  eta_note text,
  dot_label text,
  chips jsonb not null default '[]'::jsonb
);

create index if not exists route_stops_bus_sort_idx on public.route_stops (bus_id, sort_order);

-- Optional display strings for map / driver card
create table if not exists public.bus_meta (
  bus_id text primary key,
  route_label text,
  school_name text,
  driver_name text,
  driver_initials text,
  plate text,
  phone_e164 text
);

alter table public.bus_state enable row level security;
alter table public.students enable row level security;
alter table public.parent_profiles enable row level security;
alter table public.bus_notifications enable row level security;
alter table public.route_stops enable row level security;
alter table public.bus_meta enable row level security;

drop policy if exists "bus_state_select_public" on public.bus_state;
create policy "bus_state_select_public" on public.bus_state for select using (true);

drop policy if exists "students_select_public" on public.students;
create policy "students_select_public" on public.students for select using (true);

drop policy if exists "parent_profiles_select_public" on public.parent_profiles;
create policy "parent_profiles_select_public" on public.parent_profiles for select using (true);

drop policy if exists "bus_notifications_select_public" on public.bus_notifications;
create policy "bus_notifications_select_public" on public.bus_notifications for select using (true);

drop policy if exists "bus_notifications_insert_demo" on public.bus_notifications;
create policy "bus_notifications_insert_demo" on public.bus_notifications for insert with check (true);

drop policy if exists "route_stops_select_public" on public.route_stops;
create policy "route_stops_select_public" on public.route_stops for select using (true);

drop policy if exists "bus_meta_select_public" on public.bus_meta;
create policy "bus_meta_select_public" on public.bus_meta for select using (true);

-- After migrate: in Supabase Dashboard → Database → Publications, ensure
-- supabase_realtime includes bus_state, students, bus_notifications, route_stops, bus_meta
-- so the app receives postgres_changes events.
