import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireAdmin, jsonError } from "@/lib/auth";
import { SECRET_LIMITS, canStoreSecrets, isSecretName, removeSecret, saveSecret, secretStatuses } from "@/lib/secrets";

const putSchema = z.object({
  name: z.string(),
  // Sem espaços internos: chaves de API nunca os têm, e isso barra colagens erradas.
  value: z.string().trim().min(SECRET_LIMITS.min).max(SECRET_LIMITS.max).regex(/^\S+$/, "A credencial não pode ter espaços."),
});
const deleteSchema = z.object({ name: z.string() });

/** Estado das credenciais (nunca os valores). */
export async function GET() {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ canStore: canStoreSecrets(), secrets: await secretStatuses() });
}

/** Salva uma credencial cifrada. Somente Administrador Geral; o valor nunca é registrado nem devolvido. */
export async function PUT(request: Request) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const body = putSchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !isSecretName(body.data.name)) return jsonError(400, "Credencial ou valor inválido.");
  if (!canStoreSecrets()) return jsonError(503, "Salvar credenciais pelo painel exige APP_SECRETS_KEY no servidor.");

  const saved = await saveSecret(body.data.name, body.data.value, user.id);
  if (!saved.ok) return jsonError(500, saved.message);

  // O log registra quem alterou e qual credencial; o valor não entra.
  await supabase.from("admin_audit_log").insert({ actor_id: user.id, action: "secret.update", target: body.data.name, before: null, after: { last4: body.data.value.slice(-4) } });
  return NextResponse.json({ ok: true });
}

/** Remove a credencial salva no painel (volta a valer a variável de ambiente, se existir). */
export async function DELETE(request: Request) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const body = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !isSecretName(body.data.name)) return jsonError(400, "Credencial inválida.");
  if (!(await removeSecret(body.data.name))) return jsonError(500, "Não foi possível remover a credencial.");

  await supabase.from("admin_audit_log").insert({ actor_id: user.id, action: "secret.delete", target: body.data.name, before: null, after: null });
  return NextResponse.json({ ok: true });
}
