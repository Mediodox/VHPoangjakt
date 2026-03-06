import { createClient } from "@supabase/supabase-js";
import { assertPublicEnv, getServiceRoleKey } from "@/lib/env";

assertPublicEnv();

export function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getServiceRoleKey(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
