"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable, SaveSettingButton, Section, ToggleRow } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import type { CustomIntegration } from "@/lib/custom-integrations";
import { CLAUDE_MODELS, type Settings } from "@/lib/settings";

export function AiRoutingForm({ initial }: { initial: Settings["ai_routing"] }) {
  const [v, setV] = useState(initial);
  return (
    <Section title="Fornecedor de IA" desc="Vale para o Assistente, a Análise de documentos e as Petições. Documentos anexados vão para o fornecedor escolhido. A Pesquisa Jurídica continua na OpenAI, porque é ela que restringe a busca aos sites oficiais." tag="Servidor">
      <div className="grid-auto">
        <label className="field">
          Fornecedor ativo
          <select className="select" value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value as Settings["ai_routing"]["provider"] })}>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="gemini">Gemini (Google)</option>
          </select>
        </label>
        <label className="field">
          Modelo Claude
          <select className="select" value={v.anthropic_model} onChange={(e) => setV({ ...v, anthropic_model: e.target.value as Settings["ai_routing"]["anthropic_model"] })}>
            {CLAUDE_MODELS.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Modelo Gemini
          <input className="input" value={v.gemini_model} maxLength={100} onChange={(e) => setV({ ...v, gemini_model: e.target.value.trim() })} placeholder="ID do modelo, como aparece no Google AI Studio" />
        </label>
      </div>
      <div><SaveSettingButton settingKey="ai_routing" value={v} what="o fornecedor de IA" /></div>
    </Section>
  );
}

export function OpenDataForm({ initial }: { initial: Settings["open_data"] }) {
  const [v, setV] = useState(initial);
  return (
    <Section title="Dados abertos do Congresso" desc="APIs públicas, sem chave e sem custo de IA. Os resultados aparecem junto das telas Legislação e Súmulas e Pesquisa Jurídica. O LexML bloqueia chamadas de servidor, por isso segue sendo consultado só pela pesquisa nos sites oficiais.">
      <div>
        <ToggleRow label="Senado Federal" hint="Só quando o tema cita a norma, como Lei 8.078/1990. A API do Senado não busca por assunto." on={v.senado} onClick={() => setV({ ...v, senado: !v.senado })} />
        <ToggleRow label="Câmara dos Deputados" hint="Busca por tema em projetos de lei" on={v.camara} onClick={() => setV({ ...v, camara: !v.camara })} />
      </div>
      <div><SaveSettingButton settingKey="open_data" value={v} what="as fontes de dados abertos" /></div>
    </Section>
  );
}

export function ProcessLookupForm({ initial }: { initial: Settings["process_lookup"] }) {
  const [v, setV] = useState(initial);
  return (
    <Section title="Consulta processual" desc="Cada consulta é cobrada pelo fornecedor na sua conta. O número é conferido antes da chamada, e o resultado não fica salvo." tag="Pago">
      <div className="grid-auto">
        <label className="field">
          Fornecedor
          <select className="select" value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value as Settings["process_lookup"]["provider"] })}>
            <option value="">Nenhum (tela bloqueada)</option>
            <option value="escavador">Escavador</option>
            <option value="judit">Judit</option>
          </select>
        </label>
        <label className="field">
          Limite de consultas por usuário, por dia
          <input className="input" type="number" min="1" max="500" value={v.daily_limit_user} onChange={(e) => setV({ ...v, daily_limit_user: Math.min(500, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
      </div>
      <div>
        <ToggleRow label="Liberar no teste gratuito" hint="Desligado por padrão, para evitar custo com contas de teste" on={v.allow_trial} onClick={() => setV({ ...v, allow_trial: !v.allow_trial })} />
      </div>
      <div><SaveSettingButton settingKey="process_lookup" value={v} what="a consulta processual" /></div>
    </Section>
  );
}

export function CustomIntegrations({ items, ready }: { items: CustomIntegration[]; ready: boolean }) {
  const say = useToast();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", base_url: "", notes: "", key: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE", body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/custom-integrations", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Sem conexão com o servidor." };
    setBusy(false);
    if (!res?.ok) {
      setError(data.error ?? "Não foi possível concluir.");
      return;
    }
    if (method === "POST") setForm({ name: "", base_url: "", notes: "", key: "" });
    say(method === "POST" ? "API cadastrada e registrada no log." : "API removida.");
    router.refresh();
  }

  return (
    <Section title="Outras APIs" desc="Guarde aqui o endereço e a chave de qualquer API, com a chave cifrada no servidor. O cadastro só guarda os dados: a API passa a funcionar no sistema depois que a integração dela for programada.">
      {!ready && <div className="alert-err" style={{ fontSize: 12.5 }}>O cadastro será liberado quando a atualização do banco for aplicada.</div>}
      <div className="grid-auto">
        <label className="field">
          Nome
          <input className="input" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          Endereço (https://)
          <input className="input" value={form.base_url} maxLength={300} placeholder="https://" onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
        </label>
        <label className="field">
          Chave (opcional)
          <input className="input" type="password" autoComplete="off" spellCheck={false} value={form.key} maxLength={600} onChange={(e) => setForm({ ...form, key: e.target.value })} />
        </label>
        <label className="field">
          Observações
          <input className="input" value={form.notes} maxLength={300} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
      </div>
      <div>
        <button className="btn btn-dark" disabled={!ready || busy || form.name.trim().length < 2 || !form.base_url.trim()} onClick={() => send("POST", form)} style={{ fontSize: 13, padding: "9px 16px", borderRadius: 9 }}>
          {busy ? "Salvando…" : "Cadastrar API"}
        </button>
      </div>
      {error && <div className="alert-err" style={{ fontSize: 12.5 }}>{error}</div>}
      <DataTable
        cols={["Nome", "Endereço", "Chave", "Observações", ""]}
        rows={items.map((item) => [
          item.name,
          item.base_url,
          item.last4 ? `termina em ${item.last4}` : "Sem chave",
          item.notes || "—",
          <button key="r" className="btn btn-outline" disabled={busy} onClick={() => send("DELETE", { id: item.id })} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 9 }}>Remover</button>,
        ])}
        empty="Nenhuma API cadastrada."
      />
    </Section>
  );
}
