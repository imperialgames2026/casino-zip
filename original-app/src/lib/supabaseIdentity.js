import { requireSupabase } from '@/lib/supabaseClient';

export async function currentIdentity() {
  const client = requireSupabase();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user) throw new Error('Authentication required');
  const uid = auth.user.id;
  const [{ data: profile, error: profileError }, { data: role, error: roleError }] = await Promise.all([
    client.from('profiles').select('id,email,full_name,profile_picture,display_name,is_excluded,kyc_status,created_at').eq('id', uid).single(),
    client.from('user_roles').select('role').eq('user_id', uid).single(),
  ]);
  if (profileError || roleError || !profile || !role || profile.id !== uid || typeof profile.is_excluded !== 'boolean' || !['player','tester','admin','superadmin'].includes(role.role)) {
    throw new Error('Account role or eligibility unavailable');
  }
  return {
    id: uid,
    email: auth.user.email || profile.email,
    full_name: profile.full_name || '',
    username: profile.display_name || '',
    display_name: profile.display_name || null,
    profile_picture: profile.profile_picture || null,
    role: role.role,
    is_excluded: profile.is_excluded,
    kyc_status: profile.kyc_status,
    created_date: profile.created_at,
  };
}
