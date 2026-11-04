"use client";

import { useState, type FormEvent } from "react";
import type { ProcessInfo } from "@/lib/process-lookup";

const formatDate = (value: string | null) => {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

export default function ProcessLookupForm({ unavailable }: { unavailable: string | null }) {
  const [cnj, setCnj] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessInfo | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const response = await fetch("/api/process/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnj }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : { error: "Sem conexão com o servidor." };
    setBusy(false);
    if (!response?.ok) {
      setError(data.error ?? "A consulta não pôde ser concluída.");
      return;
    }
    setResult(data.process);
  }

  const rows: [string, string][] = result
    ? [
        ["Tribunal", result.court ?? "Não informado"],
        ["Classe", result.className ?? "Não informada"],
        ["Assunto", result.subject ?? "Não informado"],
        ["Situação", result.status ?? "Não informada"],
        ["Início", formatDate(result.startedAt)],
        ["Última movimentação", formatDate(result.lastMovementAt)],
      ]
    : [];

  return (
    <>
      <section style={{ background: "#fff", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 14 }}>
        {unavailable && <div className="alert-err" style={{ fontSize: 13 }}>{unavailable}</div>}
        <form onSubmit={search} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 240 }}>
            Número do processo (CNJ)
            <input className="input" inputMode="numeric" value={cnj} maxLength={25} placeholder="0000000-00.0000.0.00.0000" disabled={!!unavailable || busy} onChange={(e) => setCnj(e.target.value)} />
          </label>
          <button className="btn btn-dark" disabled={!!unavailable || busy || cnj.trim().length < 20} style={{ fontSize: 13, padding: "10px 18px", borderRadius: 9 }}>
            {busy ? <span className="spinner" /> : null}
            {busy ? "Consultando…" : "Consultar"}
          </button>
        </form>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>A consulta pode levar até 2 minutos e conta no seu limite diário.</p>
        {error && <div className="alert-err" style={{ fontSize: 13 }}>{error}</div>}
      </section>

      {result && (
        <section style={{ background: "#fff", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>{result.title}</h2>
          <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--muted)" }}>{result.cnj}. Dados informados pelo fornecedor; confira no tribunal antes de usar.</p>
          {rows.map(([label, value]) => (
            <div key={label} className="row" style={{ flexWrap: "wrap", gap: 8, fontSize: 13.5 }}>
              <span style={{ flex: "0 0 170px", color: "var(--muted)" }}>{label}</span>
              <span style={{ flex: 1, minWidth: 180, overflowWrap: "anywhere" }}>{value}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
