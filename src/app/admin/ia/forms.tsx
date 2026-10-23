"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { numOrNull, SaveSettingButton, Section, TestButton, ToggleRow, type CheckInfo } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { FEATURE_KEYS, FEATURE_LABELS, type Settings } from "@/lib/settings";

const nv = (v: number | null) => (v == null ? "" : String(v));

export function ModelForm({ initial, check }: { initial: Settings["ai_model"]; check: CheckInfo }) {
  const [v, setV] = useState(initial);
  return (
    <Section title="Fornecedor e modelo" desc="Somente a OpenAI é ativada. Outros fornecedores são previsão futura e não estão integrados." tag="Servidor">
      <div className="grid-auto">
        <label className="field">
          Fornecedor principal
          <select className="select" value="openai" onChange={() => {}}>
            <option value="openai">OpenAI</option>
            <option disabled>Gemini — futuro</option>
            <option disabled>Claude — futuro</option>
            <option disabled>OpenRouter — futuro</option>
          </select>
        </label>
        <label className="field">
          Modelo ativo
          <input className="input" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value.trim() })} placeholder="ID do modelo autorizado (ex.: definido pelo administrador)" />
          <span className="hint">Sem modelo, o assistente informa que a IA não está configurada. O teste de conexão confirma se a credencial enxerga este modelo.</span>
        </label>
        <label className="field">
          Temperatura
          <input type="range" min="0" max="1" step="0.1" value={v.temperature} onChange={(e) => setV({ ...v, temperature: Number(e.target.value) })} style={{ accentColor: "#B9965B", height: 38 }} />
          <span className="hint">Valor: {v.temperature}</span>
        </label>
        <label className="field">
          Limite máximo de saída (tokens)
          <input className="input" type="number" min="1" value={nv(v.max_output_tokens)} onChange={(e) => setV({ ...v, max_output_tokens: numOrNull(e.target.value) })} placeholder="Sem limite definido" />
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TestButton service="openai" initial={check} />
        <div><SaveSettingButton settingKey="ai_model" value={v} what="o modelo e os parâmetros de IA" /></div>
      </div>
    </Section>
  );
}

export function LimitsForm({ initial }: { initial: Settings["ai_limits"] }) {
  const [v, setV] = useState(initial);
  const f = (label: string, key: keyof Settings["ai_limits"]) => (
    <label className="field">
      {label}
      <input className="input" type="number" min="0" value={nv(v[key])} onChange={(e) => setV({ ...v, [key]: numOrNull(e.target.value) })} placeholder="Sem limite" />
    </label>
  );
  return (
    <Section title="Limites de consumo e custo" desc="Aplicados no servidor a cada requisição de IA. Campo vazio = sem limite." tag="Servidor">
      <div className="grid-auto">
        {f("Tokens por usuário / dia", "tokens_user_day")}
        {f("Tokens por usuário / mês", "tokens_user_month")}
        {f("Limite de custo mensal (R$)", "cost_month_brl")}
        <label className="field">
          Alertar ao atingir (%)
          <input className="input" type="number" min="1" max="100" value={v.alert_pct} onChange={(e) => setV({ ...v, alert_pct: Number(e.target.value) || 80 })} />
        </label>
      </div>
      <div><SaveSettingButton settingKey="ai_limits" value={v} what="os limites de consumo" /></div>
    </Section>
  );
}

export function FeaturesForm({ initial }: { initial: Settings["features"] }) {
  const [v, setV] = useState(initial);
  return (
    <Section title="Módulos habilitados" desc="Define quais módulos ficam disponíveis. A disponibilidade por plano é configurada em Plano padrão." tag="Servidor">
      <div>
        {FEATURE_KEYS.map((k) => (
          <ToggleRow key={k} label={FEATURE_LABELS[k][0]} hint={FEATURE_LABELS[k][1]} on={v[k]} onClick={() => setV({ ...v, [k]: !v[k] })} />
        ))}
      </div>
      <div><SaveSettingButton settingKey="features" value={v} what="os módulos habilitados" /></div>
    </Section>
  );
}

export function PromptForm() {
  const say = useToast();
  const router = useRouter();
  const [name, setName] = useState("assistente");
  const [content, setContent] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/admin/prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content, active }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return say(data.error ?? "Falha ao salvar o prompt.");
    say("Nova versão do prompt criada.");
    setContent("");
    router.refresh();
  }

  return (
    <Section title="Criar versão de prompt" desc="Instruções de sistema usadas pela IA. Um prompt ativo substitui a instrução padrão.">
      <label className="field">Nome<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">Conteúdo<textarea className="textarea" rows={7} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Você é o assistente jurídico da JusLegis…" /></label>
      <ToggleRow label="Ativar esta versão" hint="Desativa o prompt ativo anterior" on={active} onClick={() => setActive(!active)} />
      <div><button className="btn btn-dark" onClick={create} disabled={busy || !name.trim() || !content.trim()}>{busy && <span className="spinner" />}Criar versão</button></div>
    </Section>
  );
}
