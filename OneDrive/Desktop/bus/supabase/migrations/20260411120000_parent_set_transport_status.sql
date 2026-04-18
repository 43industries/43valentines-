-- Parents may set transport status only for students linked in parent_profiles (RLS-safe via RPC).
create or replace function public.parent_set_transport_status (
  p_student_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_id is null then
    raise exception 'student required' using errcode = '23502';
  end if;

  if p_status is null or p_status not in ('on', 'wait', 'abs', 'drop') then
    raise exception 'invalid status' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.parent_profiles pp
    where pp.user_id = auth.uid ()
      and pp.student_id = p_student_id
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.students s
  set status = p_status
  where s.id = p_student_id;

  if not found then
    raise exception 'student not found' using errcode = '23503';
  end if;
end;
$$;

revoke all on function public.parent_set_transport_status (uuid, text) from public;
grant execute on function public.parent_set_transport_status (uuid, text) to authenticated;
