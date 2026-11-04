import "server-only";
import { encryptSecret, parseMasterKey } from "@/lib/secret-crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Cadastro livre de APIs. Só guarda os dados: o sistema não chama estes endereços até haver integração
// programada, e a chave cifrada nunca volta ao navegador.

export type CustomIntegration = { id: string; name: string; base_url: string; notes: string; last4: string | null; created_at: string };

const COLUMNS = "id,name,base_url,notes,last4,created_at";
const context = (name: string) => `custom:${name}`;

export async function listCustomIntegrations(): Promise<{ ready: boolean; items: CustomIntegration[] }> {
  const admin = createAdminClient();
  if (!admin) return { ready: false, items: [] };
  const { data, error } = await admin.from("custom_integrations").select(COLUMNS).order("created_at", { ascending: false });
  return error ? { ready: false, items: [] } : { ready: true, items: (data ?? []) as CustomIntegration[] };
}

export async function addCustomIntegration(input: { name: string; base_url: string; notes: string; key: string }, userId: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Supabase não configurado no servidor." };
  let ciphertext: string | null = null;
  if (input.key) {
    const master = parseMasterKey(process.env.APP_SECRETS_KEY);
    if (!master) return { ok: false, message: "APP_SECRETS_KEY não definida no servidor." };
    ciphertext = encryptSecret(input.key, context(input.name), master);
  }
  const { data, error } = await admin
    .from("custom_integrations")
    .insert({ name: input.name, base_url: input.base_url, notes: input.notes, ciphertext, last4: input.key ? input.key.slice(-4) : null, created_by: userId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Cadastro de API falhou", { code: error?.code });
    return { ok: false, message: error?.code === "42P01" || error?.code === "PGRST205" ? "Aplique a migration 20261104000000_more_integrations.sql no Supabase." : "Não foi possível salvar a API." };
  }
  return { ok: true, id: data.id as string };
}

export async function removeCustomIntegration(id: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("custom_integrations").delete().eq("id", id);
  return !error;
}
