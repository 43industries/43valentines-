/**
 * Multi-tenant session: school comes from Supabase Auth + school_members or parent_profiles.
 */

export async function resolveTenantContext(supabase) {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return null;

  const { data: mem } = await supabase
    .from('school_members')
    .select('school_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (mem) {
    return {
      user,
      schoolId: mem.school_id,
      mode: 'staff',
      staffRole: mem.role,
      parentProfile: null,
    };
  }

  const { data: parentRows, error: pErr } = await supabase
    .from('parent_profiles')
    .select('*, students(*)')
    .eq('user_id', user.id)
    .limit(1);

  if (pErr || !parentRows?.length) return null;

  const pp = parentRows[0];
  if (!pp.students) return null;

  return {
    user,
    schoolId: pp.school_id,
    mode: 'parent',
    staffRole: null,
    parentProfile: pp,
  };
}
