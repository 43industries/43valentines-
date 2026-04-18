-- Allow teachers (staff_viewer) to update student on-bus status for attendance.
drop policy if exists "students_update_staff" on public.students;

create policy "students_update_staff" on public.students for
update using (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = students.school_id
      and m.role in ('school_admin', 'driver', 'staff_viewer')
  )
)
with check (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = students.school_id
      and m.role in ('school_admin', 'driver', 'staff_viewer')
  )
);

-- Teachers can post operational alerts (same visibility as read).
drop policy if exists "bus_notifications_insert_staff" on public.bus_notifications;

create policy "bus_notifications_insert_staff" on public.bus_notifications for
insert with check (
  auth.uid () is not null
  and exists (
    select 1
    from public.school_members m
    where m.user_id = auth.uid ()
      and m.school_id = bus_notifications.school_id
      and m.role in ('school_admin', 'driver', 'staff_viewer')
  )
);
