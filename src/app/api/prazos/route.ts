import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireUser, jsonError } from "@/lib/auth";
import { calculateDeadline } from "@/lib/prazos";

// Agenda de prazos do advogado. O cálculo é refeito no servidor (o valor enviado pelo navegador não é confiável)
// e o RLS de public.deadlines garante que cada usuário só lê e altera os próprios prazos.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  caseId: z.uuid().nullable().optional(),
  startDate: isoDate,
  days: z.number().int().min(1).max(3650),
  counting: z.enum(["business", "calendar"]),
  startMode: z.enum(["intimacao", "dje"]).default("intimacao"),
  doubled: z.boolean().default(false),
  court: z.enum(["estadual", "federal"]).default("estadual"),
  extraHolidays: z.array(isoDate).max(60).default([]),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request) {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;
  const body = createSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Dados do prazo inválidos.");

  let result;
  try {
    result = calculateDeadline(body.data);
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : "Não foi possível calcular o prazo.");
  }

  const { data, error } = await supabase
    .from("deadlines")
    .insert({
      user_id: user.id,
      case_id: body.data.caseId ?? null,
      title: body.data.title,
      start_date: body.data.startDate,
      days: body.data.days,
      counting: body.data.counting,
      doubled: body.data.doubled,
      due_date: result.dueDate,
      notes: body.data.notes || null,
    })
    .select("id,due_date")
    .single();
  if (error) return jsonError(500, "Não foi possível salvar o prazo.");
  return NextResponse.json({ ok: true, id: data.id, dueDate: data.due_date });
}

const patchSchema = z.object({ id: z.uuid(), status: z.enum(["pending", "done"]) });

export async function PATCH(request: Request) {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Requisição inválida.");
  const { data, error } = await auth.ctx.supabase.from("deadlines").update({ status: body.data.status }).eq("id", body.data.id).select("id");
  if (error) return jsonError(500, "Não foi possível atualizar o prazo.");
  if (!data?.length) return jsonError(404, "Prazo não encontrado.");
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ id: z.uuid() });

export async function DELETE(request: Request) {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const body = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Requisição inválida.");
  const { data, error } = await auth.ctx.supabase.from("deadlines").delete().eq("id", body.data.id).select("id");
  if (error) return jsonError(500, "Não foi possível excluir o prazo.");
  if (!data?.length) return jsonError(404, "Prazo não encontrado.");
  return NextResponse.json({ ok: true });
}
