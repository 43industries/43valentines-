-- Demo data for bus_07 (safe to re-run on empty dev DB)

insert into public.bus_state (bus_id, lat, lng, speed_kmh, next_stop_eta_minutes, recorded_at)
values ('bus_07', -1.286389, 36.817223, 38, 4, now())
on conflict (bus_id) do update set
  lat = excluded.lat,
  lng = excluded.lng,
  speed_kmh = excluded.speed_kmh,
  next_stop_eta_minutes = excluded.next_stop_eta_minutes,
  recorded_at = excluded.recorded_at;

insert into public.bus_meta (bus_id, route_label, school_name, driver_name, driver_initials, plate, phone_e164)
values (
  'bus_07',
  'Route A · Morning Run',
  'Nairobi Academy',
  'James Mwangi',
  'JM',
  'KCA 482T',
  '+254700000000'
)
on conflict (bus_id) do update set
  route_label = excluded.route_label,
  school_name = excluded.school_name,
  driver_name = excluded.driver_name,
  driver_initials = excluded.driver_initials,
  plate = excluded.plate,
  phone_e164 = excluded.phone_e164;

delete from public.parent_profiles
where student_id in (select id from public.students where bus_id = 'bus_07');
delete from public.students where bus_id = 'bus_07';
delete from public.route_stops where bus_id = 'bus_07';
delete from public.bus_notifications where bus_id = 'bus_07';

insert into public.students (bus_id, full_name, grade, status, avatar_initials, avatar_color, sort_order) values
  ('bus_07', 'Amara Kimani', 'Grade 4', 'on', 'AK', '#3B9EF5', 1),
  ('bus_07', 'James Lungaho', 'Grade 3', 'on', 'JL', '#8B5CF6', 2),
  ('bus_07', 'Fatuma Ahmed', 'Grade 5', 'on', 'FA', '#EC4899', 3),
  ('bus_07', 'David Mwenda', 'Grade 4', 'abs', 'DM', '#94A3B8', 4),
  ('bus_07', 'Lena Wanjiku', 'Grade 2', 'on', 'LW', '#F97316', 5),
  ('bus_07', 'Kevin Otieno', 'Grade 6', 'on', 'KO', '#22C55E', 6),
  ('bus_07', 'Priya Sharma', 'Grade 3', 'on', 'PS', '#EF4444', 7),
  ('bus_07', 'Brian Njoroge', 'Grade 5', 'on', 'BN', '#0EA5E9', 8),
  ('bus_07', 'Chloe Ruto', 'Grade 4', 'on', 'CR', '#A855F7', 9),
  ('bus_07', 'Mercy Jebet', 'Grade 2', 'wait', 'MJ', '#14B8A6', 10),
  ('bus_07', 'Tom Barasa', 'Grade 3', 'wait', 'TB', '#F59E0B', 11),
  ('bus_07', 'Aisha Mohamed', 'Grade 5', 'wait', 'AM', '#6366F1', 12),
  ('bus_07', 'Noah Kibet', 'Grade 6', 'drop', 'NK', '#10B981', 13),
  ('bus_07', 'Sara Chege', 'Grade 4', 'on', 'SC', '#F43F5E', 14),
  ('bus_07', 'Ali Hassan', 'Grade 3', 'on', 'AH', '#8B5CF6', 15),
  ('bus_07', 'Grace Muthoni', 'Grade 2', 'wait', 'GM', '#06B6D4', 16);

insert into public.parent_profiles (admission_code, student_id, parent_display_name, stop_name)
select 'ADM1001', id, 'Mrs. Jebet', 'Westlands Shopping Mall'
from public.students where bus_id = 'bus_07' and full_name = 'Mercy Jebet' limit 1;

insert into public.parent_profiles (admission_code, student_id, parent_display_name, stop_name)
select 'ADM1002', id, 'Mr. Barasa', 'Westlands Shopping Mall'
from public.students where bus_id = 'bus_07' and full_name = 'Tom Barasa' limit 1;

insert into public.bus_notifications (bus_id, category, icon, message, created_at) values
  ('bus_07', 'n-green', '✅', 'Amara Kimani safely boarded at Maple Street.', now() - interval '90 minutes'),
  ('bus_07', 'n-red', '⚠️', 'David Mwenda is marked absent today.', now() - interval '89 minutes'),
  ('bus_07', 'n-green', '✅', 'Lena Wanjiku boarded at Riverside Flats.', now() - interval '75 minutes'),
  ('bus_07', 'n-blue', '📍', 'Bus 07 approaching Westlands — ETA 4 min.', now() - interval '10 minutes'),
  ('bus_07', 'n-green', '🚌', 'Bus 07 departed Garden Estate on schedule.', now() - interval '20 minutes');

insert into public.route_stops (bus_id, sort_order, name, subtitle, scheduled_label, state, eta_note, dot_label, chips) values
  ('bus_07', 1, 'Maple Street Junction', 'Stop 1 · 6 students', '6:45 AM', 'done', null, null,
   '[{"text":"🟢 Amara K.","v":"on"},{"text":"🟢 James L.","v":"on"},{"text":"🟢 Fatuma A.","v":"on"},{"text":"🔴 David M. — Absent","v":"off"}]'::jsonb),
  ('bus_07', 2, 'Riverside Primary Flats', 'Stop 2 · 5 students', '7:00 AM', 'done', null, null,
   '[{"text":"🟢 Lena W.","v":"on"},{"text":"🟢 Kevin O.","v":"on"},{"text":"🟢 Priya S.","v":"on"}]'::jsonb),
  ('bus_07', 3, 'Garden Estate Gate B', 'Stop 3 · 4 students', '7:15 AM', 'done', null, null,
   '[{"text":"🟢 Brian N.","v":"on"},{"text":"🟢 Chloe R.","v":"on"}]'::jsonb),
  ('bus_07', 4, 'Westlands Shopping Mall', 'Stop 4 · 3 students', '~7:28 AM', 'current', '🔴 Bus arriving — ETA 4 minutes', '4',
   '[{"text":"⏳ Mercy J.","v":"wait"},{"text":"⏳ Tom B.","v":"wait"},{"text":"⏳ Aisha M.","v":"wait"}]'::jsonb),
  ('bus_07', 5, 'Kileleshwa Estate', 'Stop 5 · 4 students · Upcoming', '7:38 AM', 'upcoming', null, '5', '[]'::jsonb),
  ('bus_07', 6, 'Nairobi Academy — School Gate', 'Final destination', '7:52 AM', 'school', null, null, '[]'::jsonb);
