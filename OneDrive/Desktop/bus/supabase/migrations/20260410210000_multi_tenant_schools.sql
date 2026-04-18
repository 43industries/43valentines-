-- Multi-tenant schools: every operational row is scoped by school_id.
-- Access is enforced with RLS + Supabase Auth (anon cannot read tenant data).

-- ---------------------------------------------------------------------------
-- Core tenant
-- ---------------------------------------------------------------------------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz default now()
);

insert into public.schools (id, name, slug)
values (
  '00000000-0000-0000-0000-000000000001',
  'Demo Academy',
  'demo-academy'
)
on conflict (slug) do nothing;

create table if not exists public.school_members (
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('school_admin', 'driver', 'staff_viewer')),
  primary key (school_id, user_id)
);

create index if not exists school_members_user_id_idx on public.school_members (user_id);

-- ---------------------------------------------------------------------------
-- Add school_id to existing tables (idempotent)
-- ---------------------------------------------------------------------------
alter table public.bus_state add column if not exists school_id uuid references public.schools (id);

update public.bus_state
set school_id = '00000000-0000-0000-0000-000000000001'
where school_id is null;

alter table public.bus_state alter column school_id set not null;

alter table public.students add column if not exists school_id uuid references public.schools (id);

update public.students s
set school_id = '00000000-0000-0000-0000-000000000001'
where s.school_id is null;

alter table public.students alter column school_id set not null;

alter table public.parent_profiles add column if not exists school_id uuid references public.schools (id);
alter table public.parent_profiles add column if not exists user_id uuid references auth.users (id);
alter table public.parent_profiles add column if not exists login_email text;

update public.parent_profiles pp
set school_id = s.school_id
from public.students s
where pp.student_id = s.id
  and pp.school_id is null;

alter table public.parent_profiles alter column school_id set not null;

alter table public.bus_notifications add column if not exists school_id uuid references public.schools (id);

update public.bus_notifications
set school_id = '00000000-0000-0000-0000-000000000001'
where school_id is null;

alter table public.bus_notifications alter column school_id set not null;

alter table public.route_stops add column if not exists school_id uuid references public.schools (id);

update public.route_stops r
set school_id = '00000000-0000-0000-0000-000000000001'
where r.school_id is null;

alter table public.route_stops alter column school_id set not null;

alter table public.bus_meta add column if not exists school_id uuid references public.schools (id);

update public.bus_meta m
set school_id = '00000000-0000-0000-0000-000000000001'
where m.school_id is null;

alter table public.bus_meta alter column school_id set not null;

-- ---------------------------------------------------------------------------
-- Primary keys: bus_state + bus_meta become composite (school_id, bus_id)
-- ---------------------------------------------------------------------------
alter table public.bus_state drop constraint if exists bus_state_pkey;
alter table public.bus_state add primary key (school_id, bus_id);

alter table public.bus_meta drop constraint if exists bus_meta_pkey;
alter table public.bus_meta add primary key (school_id, bus_id);

-- ---------------------------------------------------------------------------
-- parent_profiles: admission unique per school
-- ---------------------------------------------------------------------------
alter table public.parent_profiles drop constraint if exists parent_profiles_admission_code_key;

drop index if exists parent_profiles_school_admission;
create unique index parent_profiles_school_admission on public.parent_profiles (school_id, admission_code);

create index if not exists parent_profiles_user_id_idx on public.parent_profiles (user_id);
create index if not exists parent_profiles_login_email_idx on public.parent_profiles (login_email);

-- ---------------------------------------------------------------------------
-- Optional referential integrity: students ↔ bus_state
-- ---------------------------------------------------------------------------
alter table public.students drop constraint if exists students_school_bus_fk;
alter table public.students
  add constraint students_school_bus_fk
  foreign key (school_id, bus_id) references public.bus_state (school_id, bus_id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- RLS: schools + school_members
-- ---------------------------------------------------------------------------
alter table public.schools enable row level security;
alter table public.school_members enable row level security;

drop policy if exists "schools_tenant_read" on public.schools;
create policy "schools_tenant_read" on public.schools for
select using (
  auth.uid () is not null
  and (
    exists (
      select 1
      from public.school_members m
      where m.school_id = schools.id
        and m.user_id = auth.uid ()
    )
    or exists (
      select 1
      from public.parent_profiles p
      where p.school_id = schools.id
        and p.user_id = auth.uid ()
    )
  )
);

drop policy if exists "school_members_read" on public.school_members;
create policy "school_members_read" on public.school_members for
select using (
  auth.uid () is not null
  and (
    school_members.user_id = auth.uid ()
    or exists (
      select 1
      from public.school_members m
      where m.user_id = auth.uid ()
        and m.school_id = school_members.school_id
        and m.role = 'school_admin'
    )
  )
);

-- ---------------------------------------------------------------------------
-- RLS: replace wide-open policies on operational tables
-- ---------------------------------------------------------------------------
drop policy if exists "bus_state_select_public" on public.bus_state;
drop policy if exists "students_select_public" on public.students;
drop policy if exists "parent_profiles_select_public" on public.parent_profiles;
drop policy if exists "bus_notifications_select_public" on public.bus_notifications;
drop policy if exists "bus_notifications_insert_demo" on public.bus_notifications;
drop policy if exists "route_stops_select_public" on public.route_stops;
drop policy if exists "bus_meta_select_public" on public.bus_meta;

-- bus_state: staff of school, or parent whose child rides this bus
create policy "bus_state_select_staff" on public.bus_state for
select using (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = bus_state.school_id
      and m.role in ('school_admin', 'driver', 'staff_viewer')
  )
);

create policy "bus_state_select_parent" on public.bus_state for
select using (
  auth.uid () is not null
  and exists (
    select 1
    from public.parent_profiles pp
    join public.students st on st.id = pp.student_id
    where pp.user_id = auth.uid ()
      and st.school_id = bus_state.school_id
      and st.bus_id = bus_state.bus_id
  )
);

-- students: staff see all in school; parents see peers on same bus(es) as their children
create policy "students_select_staff" on public.students for
select using (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = students.school_id
      and m.role in ('school_admin', 'driver', 'staff_viewer')
  )
);

create policy "students_select_parent" on public.students for
select using (
  auth.uid () is not null
  and exists (
    select 1
    from public.parent_profiles pp
    join public.students mine on mine.id = pp.student_id
    where pp.user_id = auth.uid ()
      and students.school_id = pp.school_id
      and students.bus_id = mine.bus_id
  )
);

create policy "students_update_staff" on public.students for
update using (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = students.school_id
      and m.role in ('school_admin', 'driver')
  )
)
with check (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = students.school_id
      and m.role in ('school_admin', 'driver')
  )
);

-- parent_profiles
create policy "parent_profiles_select_self" on public.parent_profiles for
select using (
  auth.uid () is not null
  and (
    parent_profiles.user_id = auth.uid ()
    or exists (
      select 1
      from public.school_members m
      where m.user_id = auth.uid ()
        and m.school_id = parent_profiles.school_id
        and m.role = 'school_admin'
    )
  )
);

create policy "parent_profiles_update_admin" on public.parent_profiles for
update using (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = parent_profiles.school_id
      and m.role = 'school_admin'
  )
)
with check (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = parent_profiles.school_id
      and m.role = 'school_admin'
  )
);

-- bus_notifications
create policy "bus_notifications_select" on public.bus_notifications for
select using (
  auth.uid () is not null
  and (
    exists (
      select 1
      from public.school_members m
      where m.user_id = auth.uid ()
        and m.school_id = bus_notifications.school_id
        and m.role in ('school_admin', 'driver', 'staff_viewer')
    )
    or exists (
      select 1
      from public.parent_profiles pp
      join public.students st on st.id = pp.student_id
      where pp.user_id = auth.uid ()
        and st.school_id = bus_notifications.school_id
        and st.bus_id = bus_notifications.bus_id
    )
  )
);

create policy "bus_notifications_insert_staff" on public.bus_notifications for
insert with check (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = bus_notifications.school_id
      and m.role in ('school_admin', 'driver')
  )
);

-- route_stops + bus_meta
create policy "route_stops_select_staff" on public.route_stops for
select using (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = route_stops.school_id
      and m.role in ('school_admin', 'driver', 'staff_viewer')
  )
);

create policy "route_stops_select_parent" on public.route_stops for
select using (
  auth.uid () is not null
  and exists (
    select 1
    from public.parent_profiles pp
    join public.students st on st.id = pp.student_id
    where pp.user_id = auth.uid ()
      and st.school_id = route_stops.school_id
      and st.bus_id = route_stops.bus_id
  )
);

create policy "bus_meta_select_staff" on public.bus_meta for
select using (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = bus_meta.school_id
      and m.role in ('school_admin', 'driver', 'staff_viewer')
  )
);

create policy "bus_meta_select_parent" on public.bus_meta for
select using (
  auth.uid () is not null
  and exists (
    select 1
    from public.parent_profiles pp
    join public.students st on st.id = pp.student_id
    where pp.user_id = auth.uid ()
      and st.school_id = bus_meta.school_id
      and st.bus_id = bus_meta.bus_id
  )
);

-- ---------------------------------------------------------------------------
-- Realtime: add new tables to publication (ignore if already present)
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.schools;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.school_members;
exception
  when duplicate_object then null;
end $$;
