"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toast";

// Peças reutilizáveis do painel administrativo.

export function Tabs({ base, current, tabs }: { base: string; current: string; tabs: [string, string][] }) {
  return (
    <div className="tabs">
      {tabs.map(([k, l]) => (
        <Link key={k || "root"} href={k ? `${base}?tab=${k}` : base} className={`tab${current === k ? " active" : ""}`}>
          {l}
        </Link>
      ))}
    </div>
  );
}

export function Section({ title, desc, tag, children }: { title?: string; desc?: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 className="h-card">{title}</h2>
            {desc && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
          </div>
          {tag && <span className="tag tag-outline">{tag}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Toggle({ on, onClick, label, locked }: { on: boolean; onClick?: () => void; label: string; locked?: boolean }) {
  return (
    <button type="button" className={`toggle${on ? " on" : ""}`} aria-label={label} aria-pressed={on} onClick={onClick} style={{ opacity: locked ? 0.55 : 1 }}>
      <span />
    </button>
  );
}

export function ToggleRow({ label, hint, on, onClick, locked }: { label: string; hint?: string; on: boolean; onClick?: () => void; locked?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0", borderTop: "1px solid var(--line-2)" }}>
      <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.4 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {hint && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{hint}</div>}
      </div>
      <Toggle on={on} onClick={onClick} label={label} locked={locked} />
    </div>
  );
}

export function ConfirmModal({ message, onCancel, onConfirm, busy }: { message: string; onCancel: () => void; onConfirm: () => void; busy?: boolean }) {
  return (
    <div className="modal-wrap">
      <div className="modal-bg" onClick={onCancel} />
      <div className="modal" role="dialog" aria-modal="true">
        <h2 className="serif" style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
          Confirmar alteração crítica
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted-2)", lineHeight: 1.55 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
          <button className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn" onClick={onConfirm} disabled={busy} style={{ background: "var(--bronze)", color: "#fff" }}>
            {busy && <span className="spinner" style={{ borderColor: "#fff", borderTopColor: "transparent" }} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Grava uma chave de admin_settings com confirmação. O servidor valida e registra no log. */
export function SaveSettingButton({ settingKey, value, what, label = "Salvar alterações" }: { settingKey: string; value: unknown; what: string; label?: string }) {
  const say = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: settingKey, value }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Sem conexão com o servidor." };
    setBusy(false);
    setOpen(false);
    if (!res?.ok) {
      setError([data.error, ...(data.issues ?? [])].filter(Boolean).join(" "));
      return;
    }
    say("Alteração gravada e registrada no log administrativo.");
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-dark" onClick={() => setOpen(true)} style={{ fontSize: 13, padding: "9px 16px", borderRadius: 9 }}>
        {label}
      </button>
      {error && <span style={{ fontSize: 12.5, color: "var(--red)" }}>{error}</span>}
      {open && (
        <ConfirmModal
          busy={busy}
          message={`Você está prestes a alterar ${what}. A alteração será validada pelo servidor, aplicada às novas requisições e registrada no log administrativo.`}
          onCancel={() => setOpen(false)}
          onConfirm={save}
        />
      )}
    </>
  );
}

export type CheckInfo = { ok: boolean; detail: string; at: string } | null;

/** Executa um teste de conexão real no servidor e mostra o resultado devolvido. */
export function useConnectionTest(service: string, initial: CheckInfo) {
  const [state, setState] = useState<CheckInfo>(initial);
  const [running, setRunning] = useState(false);
  async function run() {
    setRunning(true);
    const res = await fetch(`/api/admin/test/${service}`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setRunning(false);
    setState(
      res?.ok
        ? { ok: !!data.ok, detail: data.detail, at: data.checkedAt }
        : { ok: false, detail: data.error ?? "Não foi possível executar o teste.", at: new Date().toISOString() },
    );
  }
  return { state, running, run };
}

export function formatCheck(c: CheckInfo) {
  if (!c) return "Última verificação: nunca";
  const d = new Date(c.at);
  return `Última verificação: ${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} (${c.ok ? "sucesso" : "falhou"})`;
}

export function TestButton({ service, initial, label = "Testar conexão" }: { service: string; initial: CheckInfo; label?: string }) {
  const { state, running, run } = useConnectionTest(service, initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-outline" onClick={run} disabled={running} style={{ fontSize: 12.5, padding: "8px 14px", borderRadius: 9 }}>
          {running && <span className="spinner" />}
          {running ? "Testando…" : label}
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{formatCheck(state)}</span>
      </div>
      {state && <div className={state.ok ? "alert-ok" : "alert-err"} style={{ fontSize: 12 }}>{state.detail}</div>}
    </div>
  );
}

export function TestCard(props: { service: string; name: string; desc: string; status: string; initial: CheckInfo; configureHref?: string; noTest?: boolean }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{props.name}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{props.desc}</div>
        </div>
        <span className={`tag${props.initial?.ok ? " tag-ok" : ""}`}>{props.status}</span>
      </div>
      {!props.noTest && <TestButton service={props.service} initial={props.initial} />}
      {props.configureHref && (
        <Link href={props.configureHref} className="btn-link" style={{ alignSelf: "flex-start" }}>
          Configurar
        </Link>
      )}
    </div>
  );
}

export function SecretRows({ rows }: { rows: { name: string; kind: string; defined: boolean }[] }) {
  return (
    <Section title="Credenciais" desc="Definidas nas variáveis secretas da Vercel. Esta tela mostra apenas se existem — nunca exibe nem grava valores." tag="Somente backend">
      <div>
        {rows.map((r) => (
          <div key={r.name} className="row" style={{ fontSize: 13 }}>
            <span style={{ flex: 1, minWidth: 200, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5 }}>{r.name}</span>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.kind}</span>
            <span className={`tag${r.defined ? " tag-ok" : ""}`}>{r.defined ? "Definida" : "Não definida"}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="field">
      {label}
      <input className="input" disabled value={value} readOnly />
    </label>
  );
}

export function DataTable({ cols, rows, empty }: { cols: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div style={{ overflow: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div style={{ textAlign: "center", padding: "26px 12px", fontSize: 13.5, color: "var(--muted)" }}>{empty}</div>}
    </div>
  );
}

export const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export type SecretRowInfo = { name: string; label: string; kind: string; source: "painel" | "ambiente" | null; last4: string | null; hint?: string };

/** Campos para informar, trocar ou remover credenciais. O valor vai direto ao servidor, que o cifra; nunca volta ao navegador. */
export function SecretEditor({ rows, canStore }: { rows: SecretRowInfo[]; canStore: boolean }) {
  const say = useToast();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(name: string, method: "PUT" | "DELETE") {
    setBusy(name);
    setError(null);
    const res = await fetch("/api/admin/secrets", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(method === "PUT" ? { name, value: values[name] ?? "" } : { name }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Sem conexão com o servidor." };
    setBusy(null);
    if (!res?.ok) {
      setError(data.error ?? "Não foi possível concluir.");
      return;
    }
    setValues((v) => ({ ...v, [name]: "" }));
    say(method === "PUT" ? "Credencial salva com segurança e registrada no log." : "Credencial removida.");
    router.refresh();
  }

  return (
    <Section title="Credenciais" desc="Informe aqui as chaves das integrações. Elas são cifradas no servidor, nunca são exibidas depois de salvas e cada alteração fica no log administrativo." tag="Somente Administrador Geral">
      {!canStore && (
        <div className="alert-err" style={{ fontSize: 12.5 }}>
          Para salvar chaves por esta tela, defina a variável secreta APP_SECRETS_KEY (32 bytes em base64) na Vercel e reimplante. Enquanto isso, valem as variáveis de ambiente.
        </div>
      )}
      <div>
        {rows.map((r) => (
          <div key={r.name} className="row" style={{ fontSize: 13, flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1, minWidth: 260 }}>
              <span>
                {r.label} <span style={{ color: "var(--muted)", fontSize: 11.5 }}>· {r.kind}</span>
              </span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={r.source === "painel" ? `Salva no painel · termina em ${r.last4}` : r.source === "ambiente" ? "Definida na Vercel · cole aqui para substituir" : "Cole a chave aqui"}
                value={values[r.name] ?? ""}
                disabled={!canStore || busy === r.name}
                onChange={(e) => setValues((v) => ({ ...v, [r.name]: e.target.value }))}
              />
              {r.hint && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.hint}</span>}
            </label>
            <span className={`tag${r.source ? " tag-ok" : ""}`}>{r.source === "painel" ? "Definida (painel)" : r.source === "ambiente" ? "Definida (Vercel)" : "Não definida"}</span>
            <button className="btn btn-dark" disabled={!canStore || busy === r.name || (values[r.name] ?? "").trim().length < 8} onClick={() => call(r.name, "PUT")} style={{ fontSize: 12.5, padding: "8px 14px", borderRadius: 9 }}>
              {busy === r.name ? "Salvando…" : "Salvar"}
            </button>
            {r.source === "painel" && (
              <button className="btn btn-outline" disabled={busy === r.name} onClick={() => call(r.name, "DELETE")} style={{ fontSize: 12.5, padding: "8px 14px", borderRadius: 9 }}>
                Remover
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <div className="alert-err" style={{ fontSize: 12.5 }}>{error}</div>}
    </Section>
  );
}
