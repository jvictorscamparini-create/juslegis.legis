import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "@/lib/env";

/** Cliente Supabase com a sessão do usuário (RLS aplicada). Retorna null se o Supabase não estiver configurado. */
export async function createClient() {
  const cfg = supabasePublicConfig();
  if (!cfg) return null;
  const cookieStore = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado a partir de um Server Component: o proxy já renova a sessão.
        }
      },
    },
  });
}
