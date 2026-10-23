import Link from "next/link";
import { Section } from "@/components/admin/kit";
import { loadLastChecks, loadSettingsFor, secretsPresent, statusLabel } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin();
  const [checks, settings, users, subs, usage, audit] = await Promise.all([
    loadLastChecks(supabase),
    loadSettingsFor(supabase),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "authorized"),
    supabase.from("usage_events").select("input_tokens,output_tokens,created_at"),
    supabase.from("admin_audit_log").select("action,target,created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const monthTokens = (usage.data ?? []).filter((e) => new Date(e.created_at).getTime() >= monthStart).reduce((s, e) => s + e.input_tokens + e.output_tokens, 0);

  const tiles: [string, string, string][] = [
    ["Usuários cadastrados", users.error ? "—" : String(users.count ?? 0), users.error ? "Dados indisponíveis" : "Total de contas"],
    ["Assinaturas ativas", subs.error ? "—" : String(subs.count ?? 0), subs.error ? "Dados indisponíveis" : "Status autorizado"],
    ["Consumo de IA no mês", usage.error ? "—" : monthTokens.toLocaleString("pt-BR"), usage.error ? "Dados indisponíveis" : "Tokens (entrada + saída)"],
    ["Custo estimado de IA", "—", "Cálculo de custo ainda não implementado"],
  ];
  const integ: [string, string][] = [
    ["OpenAI", statusLabel(checks.openai, secretsPresent.openai())],
    ["Mercado Pago (teste)", statusLabel(checks.mp_test, secretsPresent.mpTest())],
    ["Mercado Pago (produção)", statusLabel(checks.mp_prod, secretsPresent.mpProd())],
    ["Supabase", statusLabel(checks.supabase, secretsPresent.serviceRole())],
    ["Fontes jurídicas", statusLabel(checks.legal, secretsPresent.legal())],
  ];
  const alerts: string[] = [];
  if (!settings.ai_model.model) alerts.push("Nenhum modelo de IA autorizado: o assistente não responderá.");
  if (!settings.plan.price_brl) alerts.push("Valor do plano mensal não definido.");
  if (!secretsPresent.mpWebhook()) alerts.push("MP_WEBHOOK_SECRET não definido: webhooks do Mercado Pago serão rejeitados.");
  if (settings.ai_limits.cost_month_brl == null) alerts.push("Limite de custo mensal da IA não definido.");

  return (
    <>
      <div>
        <h1 className="h-page">Visão geral</h1>
        <p className="sub">Estado real da plataforma, lido do banco e dos testes de conexão executados no servidor.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        {tiles.map(([l, v, s]) => (
          <div key={l} style={{ background: "#fff", boxShadow: "var(--shadow-card)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{l}</div>
            <div className="serif" style={{ fontSize: 30, lineHeight: 1.2 }}>{v}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{s}</div>
          </div>
        ))}
      </div>
      <Section title="Estado das integrações" desc="Resultado do último teste real. Credencial definida não significa conexão: rode o teste em Gerenciamento de APIs.">
        <div>
          {integ.map(([n, s]) => (
            <div key={n} className="row">
              <span style={{ flex: 1, fontWeight: 500 }}>{n}</span>
              <span className={`tag${s === "Conectada" ? " tag-ok" : ""}`}>{s}</span>
              <Link href="/admin/apis" className="btn-link">Configurar</Link>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Alertas">
        {alerts.length ? alerts.map((a) => <div key={a} className="alert-err">{a}</div>) : <div className="empty">Nenhum alerta.</div>}
      </Section>
      <Section title="Atividade administrativa">
        {audit.data?.length ? (
          audit.data.map((a, i) => (
            <div key={i} className="row" style={{ fontSize: 13 }}>
              <span style={{ flex: 1 }}>{a.action}{a.target ? ` · ${a.target}` : ""}</span>
              <span style={{ color: "var(--muted)", fontSize: 12 }}>{new Date(a.created_at).toLocaleString("pt-BR")}</span>
            </div>
          ))
        ) : (
          <div className="empty">Nenhum registro.</div>
        )}
      </Section>
      <div style={{ display: "none" }}>{brl(0)}</div>
    </>
  );
}
