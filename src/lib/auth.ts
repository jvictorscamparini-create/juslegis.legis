import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isAdminProfile } from "@/lib/authorization";

export { isAdminProfile } from "@/lib/authorization";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "user" | "admin";
  status: "active" | "blocked";
  created_at: string;
};

export type SessionContext = { supabase: SupabaseClient; user: User; profile: Profile | null };

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,status,created_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return { supabase, user, profile: profile ?? null };
}

export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (ctx.profile?.status === "blocked") redirect("/acesso-negado?motivo=bloqueado");
  return ctx;
}

export async function requireAdmin(): Promise<SessionContext> {
  const ctx = await requireUser();
  if (!isAdminProfile(ctx.profile)) redirect("/acesso-negado");
  return ctx;
}

type ApiResult = { ok: true; ctx: SessionContext } | { ok: false; response: NextResponse };

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function apiRequireUser(): Promise<ApiResult> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, response: jsonError(401, "Sessão expirada. Entre novamente.") };
  if (ctx.profile?.status === "blocked") return { ok: false, response: jsonError(403, "Conta bloqueada.") };
  return { ok: true, ctx };
}

export async function apiRequireAdmin(): Promise<ApiResult> {
  const res = await apiRequireUser();
  if (!res.ok) return res;
  if (!isAdminProfile(res.ctx.profile)) return { ok: false, response: jsonError(403, "Acesso restrito ao Administrador Geral.") };
  return res;
}
