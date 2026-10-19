import { supabase } from "../supabase";

/** The canonical role lives in public.user_roles, under Supabase RLS self-read policy.
 * This gate is for display only; future treasury data must also be protected by SQL RLS.
 */
export function mayReadRoyalTreasury(role: string | null | undefined): boolean {
  return role === "superadmin";
}
export async function readCurrentTreasuryRole(): Promise<"superadmin" | "denied"> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return "denied";
  const { data, error } = await supabase.from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error || !mayReadRoyalTreasury(data?.role)) return "denied";
  return "superadmin";
}
