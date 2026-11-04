import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireUser, jsonError } from "@/lib/auth";
import { lookupProcess } from "@/lib/process-lookup";
import { normalizeCnj, processLookupBlocked } from "@/lib/process-lookup-rules";
import { countProcessLookupsToday, loadAccess, loadAllSettings, PROCESS_LOOKUP_FEATURE, recordUsage } from "@/lib/runtime";

export const maxDuration = 120;

const bodySchema = z.object({ cnj: z.string().trim().min(20).max(25) });

const STATUS: Record<string, number> = { not_configured: 409, not_found: 404, auth: 502, no_credit: 502, pending: 504, upstream: 502, network: 502 };

/** Consulta um processo pelo número CNJ. O resultado vai só para a tela: nada dele é salvo. */
export async function POST(request: Request) {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  // A validação vem antes de tudo: número errado não pode gerar cobrança no fornecedor.
  const cnj = parsed.success ? normalizeCnj(parsed.data.cnj) : null;
  if (!cnj) return jsonError(400, "Número de processo inválido. Confira os dígitos no formato 0000000-00.0000.0.00.0000.");

  const settings = await loadAllSettings();
  if (!settings) return jsonError(503, "A consulta está indisponível no momento.");
  const [access, usedToday] = await Promise.all([loadAccess(supabase, user.id), countProcessLookupsToday(user.id)]);
  const blocked = processLookupBlocked({ settings, access, usedToday });
  const provider = settings.process_lookup.provider;
  if (blocked || !provider) return jsonError(403, blocked ?? "A consulta está indisponível no momento.", { code: "blocked" });

  const result = await lookupProcess(provider, cnj);
  // Fornecedor pode cobrar mesmo sem encontrar: "não encontrado" também conta no limite. O número não é registrado.
  if (result.ok || result.code === "not_found") {
    await recordUsage({ user_id: user.id, feature: PROCESS_LOOKUP_FEATURE, model: provider, input_tokens: 0, output_tokens: 0 });
  }
  if (!result.ok) return jsonError(STATUS[result.code] ?? 502, result.message, { code: result.code });
  return NextResponse.json({ process: result.process });
}
