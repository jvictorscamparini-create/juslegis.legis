import { DataTable, Section } from "@/components/admin/kit";
import { requireAdmin } from "@/lib/auth";

export default async function LogsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("admin_audit_log").select("action,target,before,after,created_at,actor_id").order("created_at", { ascending: false }).limit(100);
  const { data: actors } = await supabase.from("profiles").select("id,email").in("id", [...new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))]);
  const email = Object.fromEntries((actors ?? []).map((a) => [a.id, a.email]));
  return (
    <>
      <div>
        <h1 className="h-page">Logs</h1>
        <p className="sub">Registro de alterações administrativas (valores secretos nunca são gravados).</p>
      </div>
      <Section>
        <DataTable
          cols={["Data", "Administrador", "Ação", "Alvo"]}
          rows={(data ?? []).map((r) => [new Date(r.created_at).toLocaleString("pt-BR"), email[r.actor_id] ?? "—", r.action, r.target ?? "—"])}
          empty="Nenhum registro."
        />
      </Section>
    </>
  );
}
