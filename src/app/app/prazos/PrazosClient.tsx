"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { calculateDeadline, formatBr, urgencyOf, type Counting, type Court, type StartMode, type Urgency } from "@/lib/prazos";

export type DeadlineRow = {
  id: string;
  title: string;
  case_id: string | null;
  start_date: string;
  days: number;
  counting: Counting;
  doubled: boolean;
  due_date: string;
  status: "pending" | "done";
  notes: string | null;
};

type Feedback = { kind: "ok" | "err"; text: string } | null;

const URGENCY: Record<Urgency, { label: string; color: string; bg: string }> = {
  overdue: { label: "Vencido", color: "#9b1c1c", bg: "#fdecec" },
  today: { label: "Vence hoje", color: "#9a4b00", bg: "#fff1e0" },
  soon: { label: "Próximos dias", color: "#7a5b00", bg: "#fdf6dd" },
  later: { label: "No prazo", color: "#2f5d3a", bg: "#ebf5ee" },
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const card: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-card)" };

export default function PrazosClient({ deadlines, cases, storageReady }: { deadlines: DeadlineRow[]; cases: { id: string; name: string }[]; storageReady: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [caseId, setCaseId] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [days, setDays] = useState("15");
  const [counting, setCounting] = useState<Counting>("business");
  const [startMode, setStartMode] = useState<StartMode>("intimacao");
  const [court, setCourt] = useState<Court>("estadual");
  const [doubled, setDoubled] = useState(false);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showDone, setShowDone] = useState(false);

  const extraHolidays = useMemo(
    () => extra.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean).map(brToIso).filter((v): v is string => !!v),
    [extra],
  );

  const calc = useMemo(() => {
    try {
      return { ok: true as const, r: calculateDeadline({ startDate, days: Number(days), counting, startMode, court, doubled, extraHolidays }) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Dados inválidos." };
    }
  }, [startDate, days, counting, startMode, court, doubled, extraHolidays]);

  async function call(method: "POST" | "PATCH" | "DELETE", body: unknown) {
    const res = await fetch("/api/prazos", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Falha na operação.");
    return json;
  }

  async function save() {
    if (!title.trim()) return setFeedback({ kind: "err", text: "Dê um nome ao prazo (ex.: Contestação — processo 0001234)." });
    if (!calc.ok) return setFeedback({ kind: "err", text: calc.error });
    setBusy(true);
    setFeedback(null);
    try {
      const out = await call("POST", { title, caseId: caseId || null, startDate, days: Number(days), counting, startMode, court, doubled, extraHolidays });
      setFeedback({ kind: "ok", text: `Prazo salvo. Vencimento em ${formatBr(out.dueDate)}.` });
      setTitle("");
      router.refresh();
    } catch (e) {
      setFeedback({ kind: "err", text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: DeadlineRow) {
    try {
      await call("PATCH", { id: row.id, status: row.status === "done" ? "pending" : "done" });
      router.refresh();
    } catch (e) {
      setFeedback({ kind: "err", text: e instanceof Error ? e.message : "Falha ao atualizar." });
    }
  }

  async function remove(row: DeadlineRow) {
    if (!confirm(`Excluir o prazo "${row.title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await call("DELETE", { id: row.id });
      router.refresh();
    } catch (e) {
      setFeedback({ kind: "err", text: e instanceof Error ? e.message : "Falha ao excluir." });
    }
  }

  const pending = deadlines.filter((d) => d.status === "pending");
  const done = deadlines.filter((d) => d.status === "done");
  const caseName = new Map(cases.map((c) => [c.id, c.name]));
  const counts = pending.reduce(
    (acc, d) => ((acc[urgencyOf(d.due_date)] += 1), acc),
    { overdue: 0, today: 0, soon: 0, later: 0 } as Record<Urgency, number>,
  );

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", alignItems: "start" }}>
      <section style={card}>
        <h2 className="h-card">Calcular prazo</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          <label className="field">
            Data da intimação ou publicação
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>
              Prazo (dias)
              <input className="input" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              Contagem
              <select className="input" value={counting} onChange={(e) => setCounting(e.target.value as Counting)}>
                <option value="business">Dias úteis (CPC)</option>
                <option value="calendar">Dias corridos</option>
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>
              A data informada é
              <select className="input" value={startMode} onChange={(e) => setStartMode(e.target.value as StartMode)}>
                <option value="intimacao">Intimação / publicação</option>
                <option value="dje">Disponibilização no DJe</option>
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              Justiça
              <select className="input" value={court} onChange={(e) => setCourt(e.target.value as Court)}>
                <option value="estadual">Estadual / Trabalho</option>
                <option value="federal">Federal</option>
              </select>
            </label>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
            <input type="checkbox" checked={doubled} onChange={(e) => setDoubled(e.target.checked)} />
            Prazo em dobro (Fazenda, MP, Defensoria ou litisconsortes)
          </label>
          <label className="field">
            Feriados locais ou suspensões (opcional)
            <input className="input" placeholder="dd/mm/aaaa, separados por vírgula" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </label>

          <div style={{ borderRadius: 14, background: "var(--bg, #f7f5f0)", padding: 16 }}>
            {calc.ok ? (
              <>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Vencimento</div>
                <div style={{ fontSize: 26, fontWeight: 600, margin: "2px 0 6px" }}>{formatBr(calc.r.dueDate)}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
                  {startMode === "dje" && <>Publicação considerada: {formatBr(calc.r.publicationDate)}. </>}
                  Primeiro dia contado: {formatBr(calc.r.firstDay)}. Total: {calc.r.effectiveDays} dias {counting === "business" ? "úteis" : "corridos"}.
                </div>
                {calc.r.skipped.length > 0 && (
                  <details style={{ marginTop: 8, fontSize: 12.5 }}>
                    <summary style={{ cursor: "pointer" }}>{calc.r.skipped.filter((s) => !/^(Sábado|Domingo)$/.test(s.reason)).length} feriado(s) e suspensão(ões) considerados</summary>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                      {calc.r.skipped.filter((s) => !/^(Sábado|Domingo)$/.test(s.reason)).slice(0, 40).map((s) => (
                        <li key={s.date}>{formatBr(s.date)} — {s.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{calc.error}</div>
            )}
          </div>

          <label className="field">
            Nome do prazo
            <input className="input" maxLength={200} placeholder="Ex.: Contestação — processo 0001234-56.2026" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {cases.length > 0 && (
            <label className="field">
              Processo (opcional)
              <select className="input" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                <option value="">Sem processo vinculado</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {feedback && <div className={feedback.kind === "ok" ? "alert-ok" : "alert-err"} role="status">{feedback.text}</div>}
          <div>
            <button className="btn btn-dark" onClick={save} disabled={busy || !storageReady}>
              {busy ? <span className="spinner" /> : null}
              Salvar na agenda
            </button>
          </div>
          {!storageReady && <div className="alert-err">A agenda ainda não está disponível no banco de dados. O cálculo funciona normalmente.</div>}
          <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
            Considera feriados nacionais, Carnaval, Sexta-feira Santa, Corpus Christi e o recesso de 20/12 a 20/01. Confira feriados
            estaduais, municipais e portarias do seu tribunal antes de protocolar.
          </p>
        </div>
      </section>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 className="h-card">Próximos vencimentos</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["overdue", "today", "soon"] as Urgency[]).filter((u) => counts[u]).map((u) => (
              <span key={u} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, color: URGENCY[u].color, background: URGENCY[u].bg }}>
                {counts[u]} {URGENCY[u].label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          {pending.length === 0 ? (
            <div className="empty" style={{ padding: 28 }}>Nenhum prazo pendente.<br />Calcule um prazo e salve na agenda.</div>
          ) : (
            pending.map((d) => <Item key={d.id} d={d} caseName={d.case_id ? caseName.get(d.case_id) : undefined} onToggle={toggle} onRemove={remove} />)
          )}
        </div>
        {done.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-link" onClick={() => setShowDone((v) => !v)}>
              {showDone ? "Ocultar" : "Mostrar"} cumpridos ({done.length})
            </button>
            {showDone && done.map((d) => <Item key={d.id} d={d} caseName={d.case_id ? caseName.get(d.case_id) : undefined} onToggle={toggle} onRemove={remove} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function Item({ d, caseName, onToggle, onRemove }: { d: DeadlineRow; caseName?: string; onToggle: (d: DeadlineRow) => void; onRemove: (d: DeadlineRow) => void }) {
  const u = URGENCY[urgencyOf(d.due_date)];
  const isDone = d.status === "done";
  return (
    <div className="row" style={{ gap: 12, alignItems: "center", opacity: isDone ? 0.6 : 1 }}>
      <input type="checkbox" checked={isDone} onChange={() => onToggle(d)} aria-label={isDone ? "Marcar como pendente" : "Marcar como cumprido"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, textDecoration: isDone ? "line-through" : undefined, overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {d.days} dias {d.counting === "business" ? "úteis" : "corridos"}{d.doubled ? " (em dobro)" : ""} desde {formatBr(d.start_date)}
          {caseName ? ` · ${caseName}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 600 }}>{formatBr(d.due_date)}</div>
        {!isDone && <span style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 999, color: u.color, background: u.bg }}>{u.label}</span>}
      </div>
      <button className="btn btn-ghost" style={{ padding: "0 8px" }} onClick={() => onRemove(d)} aria-label={`Excluir ${d.title}`}>✕</button>
    </div>
  );
}

function brToIso(v: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
