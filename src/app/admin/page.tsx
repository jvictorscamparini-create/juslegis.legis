import Link from "next/link";
import { Section } from "@/components/admin/kit";
import { loadLastChecks, loadSettingsFor, loadSecretsPresent, statusLabel } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { AdminCharts } from "./AdminCharts";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin();
  const sp = await loadSecretsPresent();
  const [checks, settings, users, subs, usage, audit, profilesList] = await Promise.all([
    loadLastChecks(supabase),
    loadSettingsFor(supabase),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "authorized"),
    supabase.from("usage_events").select("input_tokens,output_tokens,created_at"),
    supabase.from("admin_audit_log").select("action,target,created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("profiles").select("created_at"),
  ]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const usageEvents = usage.data ?? [];
  const monthTokens = usageEvents.filter((e) => new Date(e.created_at).getTime() >= monthStart).reduce((s, e) => s + e.input_tokens + e.output_tokens, 0);

  const now = new Date();
  const chartMap: Record<string, { label: string; users: number; tokens: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    chartMap[key] = { label: label.charAt(0).toUpperCase() + label.slice(1), users: 0, tokens: 0 };
  }

  for (const p of profilesList.data ?? []) {
    if (!p.created_at) continue;
    const key = p.created_at.substring(0, 7);
    if (chartMap[key]) {
      chartMap[key].users += 1;
    } else {
      const d = new Date(p.created_at);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
      chartMap[key] = { label: label.charAt(0).toUpperCase() + label.slice(1), users: 1, tokens: 0 };
    }
  }

  for (const u of usageEvents) {
    if (!u.created_at) continue;
    const key = u.created_at.substring(0, 7);
    const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
    if (chartMap[key]) {
      chartMap[key].tokens += tokens;
    } else {
      const d = new Date(u.created_at);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
      chartMap[key] = { label: label.charAt(0).toUpperCase() + label.slice(1), users: 0, tokens };
    }
  }

  const chartData = Object.keys(chartMap).sort().map((k) => chartMap[k]);

  const tiles: [string, string, string][] = [
    ["Usuários cadastrados", users.error ? "—" : String(users.count ?? 0), users.error ? "Dados indisponíveis" : "Total de contas"],
    ["Assinaturas ativas", subs.error ? "—" : String(subs.count ?? 0), subs.error ? "Dados indisponíveis" : "Status autorizado"],
    ["Consumo de IA no mês", usage.error ? "—" : monthTokens.toLocaleString("pt-BR"), usage.error ? "Dados indisponíveis" : "Tokens (entrada + saída)"],
    ["Custo estimado de IA", "—", "Cálculo de custo ainda não implementado"],
  ];
  const integ: [string, string][] = [
    ["OpenAI", statusLabel(checks.openai, sp.openai)],
    ["Mercado Pago (teste)", statusLabel(checks.mp_test, sp.mpTest)],
    ["Mercado Pago (produção)", statusLabel(checks.mp_prod, sp.mpProd)],
    ["Supabase", statusLabel(checks.supabase, sp.serviceRole)],
    ["Fontes jurídicas", statusLabel(checks.legal, sp.legal)],
  ];
  const alerts: string[] = [];
  if (!settings.ai_model.model) alerts.push("Nenhum modelo de IA autorizado: o assistente não responderá.");
  if (!settings.plan.price_brl) alerts.push("Valor do plano mensal não definido.");
  if (!sp.mpWebhook) alerts.push("Segredo do webhook do Mercado Pago não definido (Integrações e APIs): os webhooks serão rejeitados.");
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
      <AdminCharts data={chartData} />
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
