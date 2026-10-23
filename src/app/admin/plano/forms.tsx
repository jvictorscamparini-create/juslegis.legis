"use client";

import { useState } from "react";
import { numOrNull, SaveSettingButton, Section, ToggleRow } from "@/components/admin/kit";
import { FEATURE_KEYS, FEATURE_LABELS, type Settings } from "@/lib/settings";

const nv = (v: number | null) => (v == null ? "" : String(v));

export function PlanForm({ initial }: { initial: Settings["plan"] }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <Section title="Assinatura mensal" desc="Preço e regras exibidos ao advogado em Minha assinatura. Ele não pode alterá-los." tag="Servidor">
        <div className="grid-auto">
          <label className="field">Valor mensal (R$)<input className="input" type="number" min="0" step="0.01" value={nv(v.price_brl)} onChange={(e) => setV({ ...v, price_brl: numOrNull(e.target.value) })} /></label>
          <label className="field">Limite de tokens por assinante / mês<input className="input" type="number" min="0" value={nv(v.tokens_month)} onChange={(e) => setV({ ...v, tokens_month: numOrNull(e.target.value) })} placeholder="Sem limite" /></label>
          <label className="field">
            Renovação
            <select className="select" value={v.renewal} onChange={(e) => setV({ ...v, renewal: e.target.value as "auto" | "man" })}>
              <option value="auto">Automática mensal</option>
              <option value="man">Manual</option>
            </select>
          </label>
          <label className="field">
            Disponibilidade do plano
            <select className="select" value={v.available ? "on" : "off"} onChange={(e) => setV({ ...v, available: e.target.value === "on" })}>
              <option value="off">Indisponível para novas assinaturas</option>
              <option value="on">Disponível</option>
            </select>
            <span className="hint">Mesmo disponível, nenhuma cobrança ocorre enquanto BILLING_ENABLED não for &quot;true&quot; no servidor.</span>
          </label>
        </div>
        <div><SaveSettingButton settingKey="plan" value={v} what="o plano padrão" /></div>
      </Section>
      <Section title="Funcionalidades incluídas" desc="Módulos liberados a quem assina.">
        {FEATURE_KEYS.map((k) => (
          <ToggleRow key={k} label={FEATURE_LABELS[k][0]} hint={FEATURE_LABELS[k][1]} on={v.features[k]} onClick={() => setV({ ...v, features: { ...v.features, [k]: !v.features[k] } })} />
        ))}
        <div><SaveSettingButton settingKey="plan" value={v} what="as funcionalidades do plano" /></div>
      </Section>
    </>
  );
}

export function TrialForm({ initial }: { initial: Settings["trial"] }) {
  const [v, setV] = useState(initial);
  const f = (label: string, key: "ai_requests" | "documents" | "petitions" | "max_tokens") => (
    <label className="field">{label}<input className="input" type="number" min="0" value={nv(v[key])} onChange={(e) => setV({ ...v, [key]: numOrNull(e.target.value) })} placeholder="Sem limite" /></label>
  );
  return (
    <Section title="Regras do teste" desc="Sem cartão de crédito. Sem cobrança automática ao expirar." tag="Servidor">
      <div className="grid-auto">
        <label className="field">Duração (dias)<input className="input" type="number" min="0" max="90" value={v.days} onChange={(e) => setV({ ...v, days: Number(e.target.value) || 0 })} /></label>
        {f("Solicitações de IA permitidas", "ai_requests")}
        {f("Limite de análises documentais", "documents")}
        {f("Limite de petições geradas", "petitions")}
        {f("Consumo máximo (tokens)", "max_tokens")}
        <label className="field">
          Ao expirar
          <select className="select" value={v.on_expire} onChange={(e) => setV({ ...v, on_expire: e.target.value as "block" | "view" })}>
            <option value="block">Bloquear novas operações pagas</option>
            <option value="view">Somente leitura dos dados</option>
          </select>
        </label>
      </div>
      <div><SaveSettingButton settingKey="trial" value={v} what="as regras do teste gratuito" /></div>
    </Section>
  );
}
