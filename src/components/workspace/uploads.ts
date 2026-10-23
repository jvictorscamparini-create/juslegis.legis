"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

// Envio de arquivos para o bucket privado user-files/<user_id>/... com registro em public.documents.

export const ACCEPTED: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "text/plain": "TXT",
};
const MAX_BYTES = 20 * 1024 * 1024;

export type UploadedDoc = { id: string; name: string; storage_path: string };

export async function uploadDocument(
  supabase: SupabaseClient,
  userId: string,
  file: File,
  context: "assistant" | "petition",
  allowed: string[],
): Promise<{ ok: true; doc: UploadedDoc } | { ok: false; error: string }> {
  if (!allowed.includes(file.type)) return { ok: false, error: `“${file.name}”: formato não aceito.` };
  if (file.size > MAX_BYTES) return { ok: false, error: `“${file.name}”: arquivo maior que 20 MB.` };
  const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
  const path = `${userId}/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage.from("user-files").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, error: `“${file.name}”: falha no envio.` };
  const { data, error } = await supabase
    .from("documents")
    .insert({ storage_path: path, name: file.name, mime_type: file.type, size_bytes: file.size, context })
    .select("id,name,storage_path")
    .single<UploadedDoc>();
  if (error || !data) {
    await supabase.storage.from("user-files").remove([path]);
    return { ok: false, error: `“${file.name}”: falha ao registrar o arquivo.` };
  }
  return { ok: true, doc: data };
}

export async function removeDocument(supabase: SupabaseClient, doc: UploadedDoc) {
  await supabase.storage.from("user-files").remove([doc.storage_path]);
  await supabase.from("documents").delete().eq("id", doc.id);
}
