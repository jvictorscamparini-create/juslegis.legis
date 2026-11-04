"use client";

import { useState, type FormEvent } from "react";
import type { LegalScope } from "@/lib/legal-search";

type Source = { title: string; url: string; category: "legislation" | "case_law"; verified_at: string };

const CATEGORY_LABEL: Record<Source["category"], string> = {
  legislation: "Legislação",
  case_law: "Jurisprudência e súmulas",
};

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

export default function LegalSearchForm({ scope, placeholder, unavailable }: { scope: LegalScope; placeholder: string; unavailable: string | null }) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSources(null);
    const response = await fetch("/api/legal/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, topic }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : { error: "Sem conexão com o servidor." };
    setBusy(false);
    if (!response?.ok) {
      setError(data.error ?? "A pesquisa não pôde ser concluída.");
      return;
    }
    setSources(data.sources ?? []);
  }

  return (
    <>
      <section style={{ background: "#fff", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 14 }}>
        {unavailable && <div className="alert-err" style={{ fontSize: 13 }}>{unavailable}</div>}
        <form onSubmit={search} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 240 }}>
            Tema jurídico
            <input className="input" value={topic} maxLength={300} placeholder={placeholder} disabled={!!unavailable || busy} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <button className="btn btn-dark" disabled={!!unavailable || busy || topic.trim().length < 3} style={{ fontSize: 13, padding: "10px 18px", borderRadius: 9 }}>
            {busy ? <span className="spinner" /> : null}
            {busy ? "Pesquisando…" : "Pesquisar"}
          </button>
        </form>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Não informe nomes, CPF ou dados de clientes. A busca pode levar até 2 minutos e conta no seu consumo de IA.</p>
        {error && <div className="alert-err" style={{ fontSize: 13 }}>{error}</div>}
      </section>

      {sources && (
        <section style={{ background: "#fff", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Fontes oficiais encontradas</h2>
          <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--muted)" }}>Os links responderam no momento da busca. Leia o conteúdo na fonte antes de citar.</p>
          {sources.map((source) => (
            <div key={source.url} className="row" style={{ flexWrap: "wrap", gap: 8, fontSize: 13.5 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{source.title}</a>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{hostOf(source.url)}</div>
              </div>
              <span className="tag">{CATEGORY_LABEL[source.category]}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
