-- Demo tenant: Demo Academy (id fixed for local + docs)
-- After seed: create Auth users in Supabase Dashboard with the same emails as login_email,
-- then run (SQL editor):
--   update public.parent_profiles pp
--   set user_id = u.id
--   from auth.users u
--   where lower(u.email) = lower(pp.login_email);
--
-- Staff (driver / admin): insert into school_members (school_id, user_id, role) values (...);

do $$
begin
  insert into public.schools (id, name, slug)
  values (
    '00000000-0000-0000-0000-000000000001',
    'Demo Academy',
    'demo-academy'
  )
  on conflict (slug) do nothing;
end $$;

delete from public.parent_profiles
where school_id = '00000000-0000-0000-0000-000000000001';
delete from public.students
where school_id = '00000000-0000-0000-0000-000000000001';
delete from public.route_stops
where school_id = '00000000-0000-0000-0000-000000000001';
delete from public.bus_notifications
where school_id = '00000000-0000-0000-0000-000000000001';
delete from public.bus_meta
where school_id = '00000000-0000-0000-0000-000000000001';
delete from public.bus_state
where school_id = '00000000-0000-0000-0000-000000000001';

insert into public.bus_state (
  school_id,
  bus_id,
  lat,
  lng,
  speed_kmh,
  next_stop_eta_minutes,
  recorded_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  'bus_07',
  -1.286389,
  36.817223,
  38,
  4,
  now()
)
on conflict (school_id, bus_id) do update set
  lat = excluded.lat,
  lng = excluded.lng,
  speed_kmh = excluded.speed_kmh,
  next_stop_eta_minutes = excluded.next_stop_eta_minutes,
  recorded_at = excluded.recorded_at;

insert into public.bus_meta (
  school_id,
  bus_id,
  route_label,
  school_name,
  driver_name,
  driver_initials,
  plate,
  phone_e164
)
values (
  '00000000-0000-0000-0000-000000000001',
  'bus_07',
  'Route A · Morning Run',
  'Nairobi Academy',
  'James Mwangi',
  'JM',
  'KCA 482T',
  '+254700000000'
)
on conflict (school_id, bus_id) do update set
  route_label = excluded.route_label,
  school_name = excluded.school_name,
  driver_name = excluded.driver_name,
  driver_initials = excluded.driver_initials,
  plate = excluded.plate,
  phone_e164 = excluded.phone_e164;

insert into public.students (
  school_id,
  bus_id,
  full_name,
  grade,
  status,
  avatar_initials,
  avatar_color,
  sort_order
) values
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Amara Kimani', 'Grade 4', 'on', 'AK', '#3B9EF5', 1),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'James Lungaho', 'Grade 3', 'on', 'JL', '#8B5CF6', 2),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Fatuma Ahmed', 'Grade 5', 'on', 'FA', '#EC4899', 3),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'David Mwenda', 'Grade 4', 'abs', 'DM', '#94A3B8', 4),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Lena Wanjiku', 'Grade 2', 'on', 'LW', '#F97316', 5),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Kevin Otieno', 'Grade 6', 'on', 'KO', '#22C55E', 6),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Priya Sharma', 'Grade 3', 'on', 'PS', '#EF4444', 7),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Brian Njoroge', 'Grade 5', 'on', 'BN', '#0EA5E9', 8),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Chloe Ruto', 'Grade 4', 'on', 'CR', '#A855F7', 9),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Mercy Jebet', 'Grade 2', 'wait', 'MJ', '#14B8A6', 10),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Tom Barasa', 'Grade 3', 'wait', 'TB', '#F59E0B', 11),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Aisha Mohamed', 'Grade 5', 'wait', 'AM', '#6366F1', 12),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Noah Kibet', 'Grade 6', 'drop', 'NK', '#10B981', 13),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Sara Chege', 'Grade 4', 'on', 'SC', '#F43F5E', 14),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Ali Hassan', 'Grade 3', 'on', 'AH', '#8B5CF6', 15),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'Grace Muthoni', 'Grade 2', 'wait', 'GM', '#06B6D4', 16);

insert into public.parent_profiles (
  school_id,
  admission_code,
  student_id,
  parent_display_name,
  stop_name,
  login_email
)
select
  '00000000-0000-0000-0000-000000000001',
  'ADM1001',
  id,
  'Mrs. Jebet',
  'Westlands Shopping Mall',
  'parent.mercy@demo.busbuddy.local'
from public.students
where school_id = '00000000-0000-0000-0000-000000000001'
  and bus_id = 'bus_07'
  and full_name = 'Mercy Jebet'
limit 1;

insert into public.parent_profiles (
  school_id,
  admission_code,
  student_id,
  parent_display_name,
  stop_name,
  login_email
)
select
  '00000000-0000-0000-0000-000000000001',
  'ADM1002',
  id,
  'Mr. Barasa',
  'Westlands Shopping Mall',
  'parent.tom@demo.busbuddy.local'
from public.students
where school_id = '00000000-0000-0000-0000-000000000001'
  and bus_id = 'bus_07'
  and full_name = 'Tom Barasa'
limit 1;

insert into public.bus_notifications (
  school_id,
  bus_id,
  category,
  icon,
  message,
  created_at
) values
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'n-green', '✅', 'Amara Kimani safely boarded at Maple Street.', now() - interval '90 minutes'),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'n-red', '⚠️', 'David Mwenda is marked absent today.', now() - interval '89 minutes'),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'n-green', '✅', 'Lena Wanjiku boarded at Riverside Flats.', now() - interval '75 minutes'),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'n-blue', '📍', 'Bus 07 approaching Westlands — ETA 4 min.', now() - interval '10 minutes'),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 'n-green', '🚌', 'Bus 07 departed Garden Estate on schedule.', now() - interval '20 minutes');

insert into public.route_stops (
  school_id,
  bus_id,
  sort_order,
  name,
  subtitle,
  scheduled_label,
  state,
  eta_note,
  dot_label,
  chips
) values
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 1, 'Maple Street Junction', 'Stop 1 · 6 students', '6:45 AM', 'done', null, null,
   '[{"text":"🟢 Amara K.","v":"on"},{"text":"🟢 James L.","v":"on"},{"text":"🟢 Fatuma A.","v":"on"},{"text":"🔴 David M. — Absent","v":"off"}]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 2, 'Riverside Primary Flats', 'Stop 2 · 5 students', '7:00 AM', 'done', null, null,
   '[{"text":"🟢 Lena W.","v":"on"},{"text":"🟢 Kevin O.","v":"on"},{"text":"🟢 Priya S.","v":"on"}]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 3, 'Garden Estate Gate B', 'Stop 3 · 4 students', '7:15 AM', 'done', null, null,
   '[{"text":"🟢 Brian N.","v":"on"},{"text":"🟢 Chloe R.","v":"on"}]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 4, 'Westlands Shopping Mall', 'Stop 4 · 3 students', '~7:28 AM', 'current', '🔴 Bus arriving — ETA 4 minutes', '4',
   '[{"text":"⏳ Mercy J.","v":"wait"},{"text":"⏳ Tom B.","v":"wait"},{"text":"⏳ Aisha M.","v":"wait"}]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 5, 'Kileleshwa Estate', 'Stop 5 · 4 students · Upcoming', '7:38 AM', 'upcoming', null, '5', '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'bus_07', 6, 'Nairobi Academy — School Gate', 'Final destination', '7:52 AM', 'school', null, null, '[]'::jsonb);
