import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabasePublicConfig } from "@/lib/env";

/**
 * Cliente com a service role (ignora RLS). Uso exclusivo no servidor, para
 * consumo, webhooks, testes de conexão e leitura de configurações de execução.
 */
export function createAdminClient() {
  const cfg = supabasePublicConfig();
  const key = serviceRoleKey();
  if (!cfg || !key) return null;
  return createClient(cfg.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
