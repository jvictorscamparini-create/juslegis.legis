import { redirect } from "next/navigation";
import { getSessionContext, isAdminProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Destino conforme a permissão verificada no servidor.
export default async function Home() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  redirect(isAdminProfile(ctx.profile) ? "/admin" : "/app");
}
