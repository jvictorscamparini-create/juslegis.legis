import { DataTable, Section } from "@/components/admin/kit";
import { requireAdmin } from "@/lib/auth";
import UserStatusButton from "./UserStatusButton";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase, user } = await requireAdmin();
  let query = supabase.from("profiles").select("id,email,role,status,created_at").order("created_at", { ascending: false }).limit(200);
  if (q.trim()) query = query.ilike("email", `%${q.trim().replace(/[%,]/g, "")}%`);
  const [{ data }, { data: subs }, { data: usage }] = await Promise.all([
    query,
    supabase.from("subscriptions").select("user_id,status"),
    supabase.from("usage_events").select("user_id,input_tokens,output_tokens"),
  ]);
  const subOf = new Map<string, string>();
  for (const s of subs ?? []) if (s.status === "authorized" || !subOf.has(s.user_id)) subOf.set(s.user_id, s.status);
  const tokens = new Map<string, number>();
  for (const u of usage ?? []) tokens.set(u.user_id, (tokens.get(u.user_id) ?? 0) + u.input_tokens + u.output_tokens);

  return (
    <>
      <div>
        <h1 className="h-page">Usuários</h1>
        <p className="sub">Contas, acesso, plano e consumo. Para promover um Administrador Geral, use supabase/promote-admin.sql.</p>
      </div>
      <Section>
        <form style={{ display: "flex", gap: 10 }}>
          <input className="input" name="q" defaultValue={q} placeholder="Buscar por e-mail" style={{ minWidth: 240, height: 36 }} />
          <button className="btn btn-outline" style={{ padding: "0 14px" }}>Buscar</button>
        </form>
        <DataTable
          cols={["E-mail", "Cadastro", "Situação", "Assinatura", "Consumo de IA (tokens)", ""]}
          rows={(data ?? []).map((p) => [
            <span key="e">{p.email}{p.role === "admin" && <span className="tag tag-outline" style={{ marginLeft: 8 }}>Admin</span>}</span>,
            new Date(p.created_at).toLocaleDateString("pt-BR"),
            p.status === "active" ? "Ativo" : "Bloqueado",
            subOf.get(p.id) ?? "Teste gratuito / sem assinatura",
            (tokens.get(p.id) ?? 0).toLocaleString("pt-BR"),
            p.id === user.id || p.role === "admin" ? "" : <UserStatusButton key="b" id={p.id} status={p.status} />,
          ])}
          empty="Nenhum usuário cadastrado."
        />
      </Section>
    </>
  );
}
