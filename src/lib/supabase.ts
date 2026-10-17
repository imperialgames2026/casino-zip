import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "https://qonqemhljgxlwpghkxhn.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_Blh6VwSVAwqUiaVponaRNA_xZ4a6oeM";

// Only a public publishable key is used in the browser; never embed a secret/service-role key.
export const supabase = createClient(url, publishableKey);
