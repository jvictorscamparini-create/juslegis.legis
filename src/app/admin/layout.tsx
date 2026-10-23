import AdminShell from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "JusLegis Admin" };

// Autorização verificada no servidor a cada requisição: papel "admin" ativo em public.profiles.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AdminShell crumb="JusLegis Admin">{children}</AdminShell>;
}
