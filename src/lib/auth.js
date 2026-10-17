import { supabase } from './supabase';
export async function getCurrentUser() {
 if (!supabase) throw new Error('Supabase is not configured');
 const { data: { user }, error } = await supabase.auth.getUser();
 if (error) throw error;
 return user;
}
export async function signOut() {
 if (!supabase) throw new Error('Supabase is not configured');
 const { error } = await supabase.auth.signOut();
 if (error) throw error;
}
export async function getAccessProfile() {
 const user = await getCurrentUser();
 if (!user) return null;
 const { data, error } = await supabase.from('profiles').select('id,display_name,role,excluded').eq('id',user.id).single();
 if (error) throw error;
 if (data.excluded) throw new Error('Account is excluded');
 return { ...data, email: user.email };
}
