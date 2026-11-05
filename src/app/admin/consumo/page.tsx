import Link from "next/link";
import { DataTable, Section } from "@/components/admin/kit";
import { budgetUsedPct } from "@/lib/access";
import { requireAdmin } from "@/lib/auth";
import { loadAllSettings, loadGlobalBudget } from "@/lib/runtime";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { aggregateUsage, featureName, periodStartIso, type Bucket, type UsageEventRow } from "@/lib/usage-report";
import UserStatusButton from "../usuarios/UserStatusButton";
import { BudgetForm, LimitEditor, PriceForm } from "./Controls";

export const metadata = { title: "Consumo e custos — JusLegis Admin" };

const PERIODS = [7, 30, 90] as const;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 1 ? 4 : 2 });
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 1 ? 4 : 2 });
const n = (v: number) => v.toLocaleString("pt-BR");

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" | "err" }) {
  const color = tone === "err" ? "#9b1c1c" : tone === "warn" ? "#9a4b00" : undefined;
  return (
    <div className="card" style={{ padding: 18, gap: 4 }}>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: "var(--muted)" }}>{note}</div>}
    </div>
  );
}

function DailyChart({ daily }: { daily: Bucket[] }) {
  const max = Math.max(...daily.map((d) => d.costBrl), 0);
  const byTokens = max === 0;
  const peak = byTokens ? Math.max(...daily.map((d) => d.tokens), 1) : max;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: daily.length > 40 ? 1 : 3, height: 140, borderBottom: "1px solid var(--line, #e7e3da)" }} role="img" aria-label="Gasto por dia">
        {daily.map((d) => {
          const v = byTokens ? d.tokens : d.costBrl;
          const h = v ? Math.max(3, Math.round((v / peak) * 136)) : 0;
          const [, m, day] = d.key.split("-");
          return (
            <div
              key={d.key}
              title={`${day}/${m}: ${brl(d.costBrl)} · ${n(d.tokens)} tokens · ${n(d.requests)} chamadas${d.errors ? ` · ${d.errors} erros` : ""}`}
              style={{ flex: 1, height: h, background: "var(--gold, #b8955a)", borderRadius: "3px 3px 0 0", minWidth: 2 }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
        <span>{daily[0]?.key.split("-").reverse().slice(0, 2).join("/")}</span>
        <span>{byTokens ? "Sem custo precificado no período — barras por tokens" : `Pico: ${brl(max)} em um dia`}</span>
        <span>{daily.at(-1)?.key.split("-").reverse().slice(0, 2).join("/")}</span>
      </div>
    </div>
  );
}

export default async function ConsumoPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias } = await searchParams;
  const days = (PERIODS as readonly number[]).includes(Number(dias)) ? Number(dias) : 30;
  const { supabase, user } = await requireAdmin();
  const settings = (await loadAllSettings()) ?? DEFAULT_SETTINGS;
  const since = periodStartIso(days);

  const [events, { data: profiles }, { data: limits }, { data: prices }, budget] = await Promise.all([
    supabase
      .from("usage_events")
      .select("user_id,feature,model,input_tokens,output_tokens,cost_brl,cost_usd,status,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50_000),
    supabase.from("profiles").select("id,email,role,status").limit(2000),
    supabase.from("user_limits").select("user_id,tokens_month,cost_month_brl"),
    supabase.from("ai_model_prices").select("model,input_per_mtok_usd,cached_input_per_mtok_usd,output_per_mtok_usd,effective_from").order("effective_from", { ascending: false }).limit(100),
    loadGlobalBudget(settings),
  ]);

  const schemaMissing = !!events.error;
  const report = aggregateUsage((events.data ?? []) as UsageEventRow[], { days });
  const profileOf = new Map((profiles ?? []).map((p) => [p.id as string, p as { id: string; email: string; role: string; status: string }]));
  const limitOf = new Map((limits ?? []).map((l) => [l.user_id as string, { tokens: l.tokens_month as number | null, cost: l.cost_month_brl == null ? null : Number(l.cost_month_brl) }]));
  const pct = budget ? budgetUsedPct(budget) : null;
  const spentMonth = budget && Number.isFinite(budget.spentBrl) ? budget.spentBrl : null;
  const budgetTone = pct == null ? undefined : pct >= 100 ? "err" : pct >= settings.ai_limits.alert_pct ? "warn" : undefined;
  const pricedModels = new Set((prices ?? []).map((p) => p.model as string));
  const unpricedModels = report.byModel.filter((m) => m.unpriced > 0 && m.key !== "sem modelo").map((m) => m.key);
  const suggested = [...new Set([...unpricedModels, settings.ai_model.model].filter((m) => m && !pricedModels.has(m)))];

  // Usuários com uso no período e, depois, os que têm limite individual sem uso.
  const userRows = [...report.byUser];
  for (const id of limitOf.keys()) if (!userRows.some((b) => b.key === id)) userRows.push({ key: id, requests: 0, errors: 0, tokens: 0, costBrl: 0, costUsd: 0, unpriced: 0 });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="h-page">Consumo e custos</h1>
          <p className="sub">Uso da IA, gasto em reais e controles de limite. Valores calculados pela tabela de preços abaixo.</p>
        </div>
        <div className="tabs">
          {PERIODS.map((p) => (
            <Link key={p} href={`/admin/consumo?dias=${p}`} className={`tab${p === days ? " active" : ""}`}>{p} dias</Link>
          ))}
        </div>
      </div>

      {schemaMissing && (
        <div className="alert-err">
          As tabelas de custo ainda não existem no banco. Aplique as migrações 20261103010000_ai_cost_tracking e 20261105000000_prazos_limites.
        </div>
      )}
      {budgetTone && (
        <div className={budgetTone === "err" ? "alert-err" : "alert-ok"} style={budgetTone === "warn" ? { background: "#fff1e0", color: "#9a4b00" } : undefined}>
          {budgetTone === "err"
            ? "O teto global de gasto do mês foi atingido: a IA está pausada para todos os usuários."
            : `O gasto do mês já passou de ${settings.ai_limits.alert_pct}% do teto global.`}
        </div>
      )}
      {report.totals.unpriced > 0 && (
        <div className="alert-err" style={{ background: "#fdf6dd", color: "#7a5b00" }}>
          {n(report.totals.unpriced)} chamada(s) no período sem preço cadastrado{unpricedModels.length ? ` (${unpricedModels.join(", ")})` : ""}. Elas contam como R$ 0 até você cadastrar o preço do modelo.
        </div>
      )}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Kpi label={`Gasto em ${days} dias`} value={brl(report.totals.costBrl)} note={report.totals.costUsd ? `${usd(report.totals.costUsd)} na OpenAI` : undefined} />
        <Kpi
          label="Gasto no mês"
          value={spentMonth == null ? "—" : brl(spentMonth)}
          note={settings.ai_limits.cost_month_brl == null ? "Sem teto global definido" : `${pct ?? 0}% do teto de ${brl(settings.ai_limits.cost_month_brl)}`}
          tone={budgetTone}
        />
        <Kpi label="Chamadas de IA" value={n(report.totals.requests)} note={report.totals.errors ? `${n(report.totals.errors)} com erro` : "Nenhum erro"} tone={report.totals.errors ? "warn" : undefined} />
        <Kpi label="Tokens" value={n(report.totals.tokens)} note={report.totals.requests ? `${n(Math.round(report.totals.tokens / report.totals.requests))} por chamada` : undefined} />
        <Kpi label="Usuários ativos na IA" value={n(report.byUser.filter((u) => u.requests > 0).length)} />
      </div>

      <Section title="Gasto por dia" desc="Passe o cursor sobre uma barra para ver o detalhe do dia.">
        <DailyChart daily={report.daily} />
      </Section>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
        <Section title="Por funcionalidade">
          <DataTable
            cols={["Funcionalidade", "Chamadas", "Tokens", "Gasto"]}
            rows={report.byFeature.map((b) => [featureName(b.key), n(b.requests), n(b.tokens), brl(b.costBrl)])}
            empty="Sem uso no período."
          />
        </Section>
        <Section title="Por modelo">
          <DataTable
            cols={["Modelo", "Chamadas", "Tokens", "Gasto"]}
            rows={report.byModel.map((b) => [b.key, n(b.requests), n(b.tokens), b.unpriced === b.requests && b.requests ? "Sem preço" : brl(b.costBrl)])}
            empty="Sem uso no período."
          />
        </Section>
      </div>

      <Section title="Por usuário" desc="Limite individual sobrepõe o limite mensal geral. Bloquear corta o acesso à conta inteira.">
        <DataTable
          cols={["Usuário", "Chamadas", "Tokens", `Gasto (${days} dias)`, "Limite individual", "", ""]}
          rows={userRows.map((b) => {
            const p = profileOf.get(b.key);
            const lim = limitOf.get(b.key);
            const isSelfOrAdmin = !p || p.id === user.id || p.role === "admin";
            return [
              <span key="u">
                {p?.email ?? "Conta removida"}
                {p?.role === "admin" && <span className="tag tag-outline" style={{ marginLeft: 6 }}>Admin</span>}
                {p?.status === "blocked" && <span className="tag tag-err" style={{ marginLeft: 6 }}>Bloqueado</span>}
              </span>,
              n(b.requests),
              n(b.tokens),
              brl(b.costBrl),
              lim ? [lim.tokens != null ? `${n(lim.tokens)} tokens` : null, lim.cost != null ? brl(lim.cost) : null].filter(Boolean).join(" · ") + "/mês" : "Limite geral",
              p ? <LimitEditor key="l" userId={p.id} email={p.email} tokens={lim?.tokens ?? null} cost={lim?.cost ?? null} /> : "",
              isSelfOrAdmin ? "" : <UserStatusButton key="s" id={p.id} status={p.status} />,
            ];
          })}
          empty="Nenhum uso de IA no período."
        />
      </Section>

      <Section title="Controles de gasto" desc="Alterações pedem confirmação e ficam registradas no log administrativo.">
        <BudgetForm limits={settings.ai_limits} finance={settings.finance} />
      </Section>

      <Section title="Tabela de preços dos modelos" desc="Preço oficial da OpenAI por milhão de tokens, em dólar. Um preço novo vale para as próximas chamadas.">
        <PriceForm suggestedModels={suggested} />
        <DataTable
          cols={["Modelo", "Entrada", "Entrada em cache", "Saída", "Vigente desde"]}
          rows={(prices ?? []).map((p) => [
            p.model,
            usd(Number(p.input_per_mtok_usd)),
            p.cached_input_per_mtok_usd == null ? "—" : usd(Number(p.cached_input_per_mtok_usd)),
            usd(Number(p.output_per_mtok_usd)),
            new Date(p.effective_from).toLocaleDateString("pt-BR"),
          ])}
          empty="Nenhum preço cadastrado: o gasto aparece como R$ 0 até você cadastrar o preço do modelo em uso."
        />
        {settings.finance.usd_brl == null && (
          <div style={{ fontSize: 12.5, color: "#9a4b00" }}>Câmbio não definido: o custo fica só em dólar e não entra no gasto em reais nem no teto global.</div>
        )}
      </Section>
    </>
  );
}
