import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAiAllowed } from "@/lib/access";
import { aiError, generate, type AiInputPart, type AiMessage } from "@/lib/ai";
import { apiRequireUser, jsonError } from "@/lib/auth";
import { activePrompt, loadAccess, loadAllSettings, loadUsage, recordUsage } from "@/lib/runtime";

export const maxDuration = 120;

const bodySchema = z.object({
  conversationId: z.uuid().nullable().optional(),
  caseId: z.uuid().nullable().optional(),
  text: z.string().max(20_000).default(""),
  documentIds: z.array(z.uuid()).max(10).default([]),
  retry: z.boolean().optional(),
});

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "ok" | "error";
  document_ids: string[];
  created_at: string;
};

const MESSAGE_COLUMNS = "id,role,content,status,error_code,document_ids,created_at";

async function documentParts(supabase: SupabaseClient, ids: string[]): Promise<AiInputPart[]> {
  if (!ids.length) return [];
  const { data: docs } = await supabase.from("documents").select("id,name,mime_type,storage_path").in("id", ids);
  const parts: AiInputPart[] = [];
  for (const doc of docs ?? []) {
    const { data: blob } = await supabase.storage.from("user-files").download(doc.storage_path);
    if (!blob) {
      parts.push({ type: "input_text", text: `[Arquivo "${doc.name}" não pôde ser lido do armazenamento.]` });
      continue;
    }
    if (doc.mime_type === "application/pdf") {
      const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
      parts.push({ type: "input_file", filename: doc.name, file_data: `data:application/pdf;base64,${b64}` });
    } else if (doc.mime_type === "text/plain") {
      parts.push({ type: "input_text", text: `Conteúdo do arquivo "${doc.name}":\n${(await blob.text()).slice(0, 100_000)}` });
    } else {
      parts.push({
        type: "input_text",
        text: `[O advogado anexou "${doc.name}" (DOCX). A extração de texto de DOCX ainda não está disponível; informe isso se o conteúdo for necessário.]`,
      });
    }
  }
  return parts;
}

export async function POST(request: Request) {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Requisição inválida.");
  const { caseId, text, documentIds, retry } = parsed.data;
  let conversationId = parsed.data.conversationId ?? null;

  // 1. Conversa e mensagem do advogado (gravadas com a sessão dele: RLS garante a posse).
  let userMessage: MessageRow | null = null;
  if (retry) {
    if (!conversationId) return jsonError(400, "Conversa não informada.");
    const { data: last } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<MessageRow>();
    if (last?.role === "assistant" && last.status === "error") await supabase.from("messages").delete().eq("id", last.id);
  } else {
    if (!text.trim() && !documentIds.length) return jsonError(400, "Escreva uma pergunta ou anexe um arquivo.");
    if (!conversationId) {
      const title = (text.trim() || "Análise de documento").slice(0, 48);
      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({ title, case_id: caseId ?? null })
        .select("id")
        .single();
      if (error || !conv) return jsonError(500, "Não foi possível criar a conversa.");
      conversationId = conv.id as string;
    }
    const { data: msg, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role: "user", content: text.trim(), document_ids: documentIds })
      .select(MESSAGE_COLUMNS)
      .single<MessageRow>();
    if (error || !msg) return jsonError(500, "Não foi possível registrar a mensagem.");
    userMessage = msg;
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  const saveAssistant = async (content: string, status: "ok" | "error", errorCode?: string, model?: string) => {
    const { data } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role: "assistant", content, status, error_code: errorCode ?? null, model: model ?? null })
      .select(MESSAGE_COLUMNS)
      .single<MessageRow>();
    return data;
  };
  const respond = async (content: string, status: "ok" | "error", errorCode?: string, model?: string) =>
    NextResponse.json({
      conversationId,
      userMessage,
      assistantMessage: await saveAssistant(content, status, errorCode, model),
    });

  // 2. Configuração, acesso e limites (verificados no servidor).
  const settings = await loadAllSettings();
  if (!settings) {
    const err = aiError("not_configured");
    return respond(err.ok ? "" : err.message, "error", "not_configured");
  }
  const access = await loadAccess(supabase, user.id);
  const usage = await loadUsage(supabase, user.id);

  const { data: history } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .eq("status", "ok")
    .order("created_at", { ascending: false })
    .limit(20);
  const ordered = ((history ?? []) as MessageRow[]).reverse();
  const lastUser = [...ordered].reverse().find((m) => m.role === "user");
  const currentDocs = lastUser?.document_ids ?? [];

  const blocked = checkAiAllowed({ feature: "assistant", settings, access, usage, hasDocuments: currentDocs.length > 0 });
  if (blocked) return respond(blocked, "error", "blocked");

  // 3. Chamada ao fornecedor de IA com o histórico e os anexos da última mensagem.
  const input: AiMessage[] = [];
  for (const m of ordered) {
    if (m.role === "assistant") input.push({ role: "assistant", content: m.content });
    else {
      const parts: AiInputPart[] = [];
      if (m.id === lastUser?.id) parts.push(...(await documentParts(supabase, currentDocs)));
      parts.push({ type: "input_text", text: m.content || "Analise o(s) documento(s) anexado(s)." });
      input.push({ role: "user", content: parts });
    }
  }

  const result = await generate({ config: settings.ai_model, routing: settings.ai_routing, instructions: (await activePrompt()) ?? undefined, input });
  if (!result.ok) return respond(result.message, "error", result.code);

  await recordUsage({
    user_id: user.id,
    feature: currentDocs.length ? "document_analysis" : "assistant",
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
  });
  return respond(result.text, "ok", undefined, result.model);
}
