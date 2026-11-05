"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SaveSettingButton } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import type { Settings } from "@/lib/settings";

const toNum = (v: string): number | null => {
  // "1.234,56" (formato brasileiro) ou "0.25" (ponto decimal).
  const raw = v.trim();
  const s = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const toInt = (v: string): number | null => {
  const n = toNum(v);
  return n == null || Number.isNaN(n) ? n : Math.round(n);
};
const show = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

/** Teto global, limites gerais por usuário e câmbio, gravados em admin_settings (com confirmação e log). */
export function BudgetForm({ limits, finance }: { limits: Settings["ai_limits"]; finance: Settings["finance"] }) {
  const [cap, setCap] = useState(show(limits.cost_month_brl));
  const [alertPct, setAlertPct] = useState(String(limits.alert_pct));
  const [month, setMonth] = useState(show(limits.tokens_user_month));
  const [day, setDay] = useState(show(limits.tokens_user_day));
  const [rate, setRate] = useState(show(finance.usd_brl));

  const value = {
    ...limits,
    cost_month_brl: toNum(cap),
    alert_pct: Math.min(100, Math.max(1, Math.round(Number(alertPct) || 80))),
    tokens_user_month: toInt(month),
    tokens_user_day: toInt(day),
  };
  const field = (label: string, v: string, set: (s: string) => void, hint: string) => (
    <label className="field" style={{ flex: 1, minWidth: 180 }}>
      {label}
      <input className="input" inputMode="decimal" value={v} placeholder="Sem limite" onChange={(e) => set(e.target.value)} />
      <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 400 }}>{hint}</span>
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {field("Teto global de gasto no mês (R$)", cap, setCap, "Ao atingir, a IA pausa para todos até o mês seguinte.")}
        {field("Alerta ao atingir (%)", alertPct, setAlertPct, "Aviso no painel antes do teto.")}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {field("Limite mensal por usuário (tokens)", month, setMonth, "Vale para quem não tem limite individual.")}
        {field("Limite diário por usuário (tokens)", day, setDay, "Vale para todos.")}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <SaveSettingButton settingKey="ai_limits" value={value} what="os limites de uso e o teto de gasto da IA" label="Salvar limites" />
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--line, #eee)", paddingTop: 14 }}>
        {field("Câmbio dólar → real", rate, setRate, "Converte o custo da OpenAI (em dólar) para reais nas próximas chamadas.")}
        <div style={{ paddingBottom: 22 }}>
          <SaveSettingButton settingKey="finance" value={{ usd_brl: toNum(rate) }} what="o câmbio usado no cálculo de custo" label="Salvar câmbio" />
        </div>
      </div>
    </div>
  );
}

/** Edição do limite individual de um usuário. */
export function LimitEditor({ userId, email, tokens, cost }: { userId: string; email: string; tokens: number | null; cost: number | null }) {
  const router = useRouter();
  const say = useToast();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(show(tokens));
  const [c, setC] = useState(show(cost));
  const [busy, setBusy] = useState(false);

  async function save(clear = false) {
    const tokens_month = clear ? null : toInt(t);
    const cost_month_brl = clear ? null : toNum(c);
    if (Number.isNaN(tokens_month) || Number.isNaN(cost_month_brl)) return say("Valores inválidos.");
    setBusy(true);
    const res = await fetch("/api/admin/limits", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, tokens_month, cost_month_brl }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return say("Não foi possível gravar o limite.");
    say(clear ? "Limite individual removido." : "Limite individual gravado e registrado no log.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn-link" onClick={() => setOpen(true)}>
        {tokens == null && cost == null ? "Definir limite" : "Alterar limite"}
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", minWidth: 280 }} aria-label={`Limite de ${email}`}>
      <input className="input" style={{ width: 110, height: 32 }} placeholder="Tokens/mês" value={t} onChange={(e) => setT(e.target.value)} />
      <input className="input" style={{ width: 100, height: 32 }} placeholder="R$/mês" value={c} onChange={(e) => setC(e.target.value)} />
      <button className="btn btn-dark" style={{ padding: "0 10px", height: 32 }} disabled={busy} onClick={() => save()}>Salvar</button>
      {(tokens != null || cost != null) && (
        <button className="btn-link" disabled={busy} onClick={() => save(true)}>Remover</button>
      )}
      <button className="btn-link" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
    </div>
  );
}

/** Cadastro de preço de modelo (por milhão de tokens, em dólar). */
export function PriceForm({ suggestedModels }: { suggestedModels: string[] }) {
  const router = useRouter();
  const say = useToast();
  const [model, setModel] = useState(suggestedModels[0] ?? "");
  const [input, setInput] = useState("");
  const [cached, setCached] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const i = toNum(input);
    const o = toNum(output);
    const ca = toNum(cached);
    if (!model.trim() || i == null || o == null || Number.isNaN(i) || Number.isNaN(o) || Number.isNaN(ca)) {
      return say("Informe o modelo e os preços de entrada e saída.");
    }
    if (!confirm(`Cadastrar o preço de ${model}? Vale para as próximas chamadas; as anteriores mantêm o preço da época.`)) return;
    setBusy(true);
    const res = await fetch("/api/admin/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.trim(), input_per_mtok_usd: i, cached_input_per_mtok_usd: ca, output_per_mtok_usd: o }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return say("Não foi possível gravar o preço.");
    say("Preço cadastrado.");
    setInput("");
    setCached("");
    setOutput("");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label className="field" style={{ minWidth: 180 }}>
        Modelo
        <input className="input" list="price-models" value={model} onChange={(e) => setModel(e.target.value)} />
        <datalist id="price-models">{suggestedModels.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
      <label className="field" style={{ width: 130 }}>
        Entrada (US$/1M)
        <input className="input" inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} />
      </label>
      <label className="field" style={{ width: 130 }}>
        Entrada em cache
        <input className="input" inputMode="decimal" placeholder="Opcional" value={cached} onChange={(e) => setCached(e.target.value)} />
      </label>
      <label className="field" style={{ width: 130 }}>
        Saída (US$/1M)
        <input className="input" inputMode="decimal" value={output} onChange={(e) => setOutput(e.target.value)} />
      </label>
      <button className="btn btn-dark" style={{ height: 40 }} disabled={busy} onClick={save}>Cadastrar preço</button>
    </div>
  );
}
