"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { soonMessage, useToast } from "@/components/Toast";
import { LEGEND } from "@/components/workspace/legend";
import { ACCEPTED, removeDocument, uploadDocument, type UploadedDoc } from "@/components/workspace/uploads";
import { createClient } from "@/lib/supabase/client";

type Case = { id: string; name: string };
type Conversation = { id: string; title: string; case_id: string | null; updated_at: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "ok" | "error" | "loading";
  document_ids: string[];
};

const STARTERS = ["Resumir um documento enviado", "Pesquisar fundamentos para um tema", "Estruturar uma petição"];
const ASSISTANT_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export default function AssistantView({ userId, aiReady, enabled }: { userId: string; aiReady: boolean; enabled: boolean }) {
  const supabase = createClient();
  const say = useToast();
  const [cases, setCases] = useState<Case[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [docNames, setDocNames] = useState<Record<string, string>>({});
  const [conv, setConv] = useState<string | null>(null);
  const [caseF, setCaseF] = useState<string>("all");
  const [ncOpen, setNcOpen] = useState(false);
  const [ncName, setNcName] = useState("");
  const [inp, setInp] = useState("");
  const [files, setFiles] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<"none" | "hist" | "src">("none");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [c, v] = await Promise.all([
        supabase.from("cases").select("id,name").order("created_at"),
        supabase.from("conversations").select("id,title,case_id,updated_at").order("updated_at", { ascending: false }),
      ]);
      setCases(c.data ?? []);
      setConvs(v.data ?? []);
    })();
  }, [supabase]);

  const openConv = useCallback(
    async (id: string) => {
      setConv(id);
      setPanel("none");
      if (!supabase) return;
      const { data } = await supabase
        .from("messages")
        .select("id,role,content,status,document_ids")
        .eq("conversation_id", id)
        .order("created_at");
      const list = (data ?? []) as Message[];
      setMsgs(list);
      const ids = [...new Set(list.flatMap((m) => m.document_ids))];
      if (ids.length) {
        const { data: docs } = await supabase.from("documents").select("id,name").in("id", ids);
        setDocNames((d) => ({ ...d, ...Object.fromEntries(((docs ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])) }));
      }
    },
    [supabase],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function addCase() {
    const name = ncName.trim();
    if (!name || !supabase) return;
    const { data, error } = await supabase.from("cases").insert({ name }).select("id,name").single();
    if (error || !data) return say("Não foi possível criar o caso.");
    setCases((c) => [...c, data]);
    setCaseF(data.id);
    setNcName("");
    setNcOpen(false);
  }

  async function onFiles(list: FileList | null) {
    if (!list || !supabase) return;
    for (const file of Array.from(list)) {
      setUploading((n) => n + 1);
      const res = await uploadDocument(supabase, userId, file, "assistant", ASSISTANT_TYPES);
      setUploading((n) => n - 1);
      if (res.ok) {
        setFiles((f) => [...f, res.doc]);
        setDocNames((d) => ({ ...d, [res.doc.id]: res.doc.name }));
      } else say(res.error);
    }
  }

  async function call(body: Record<string, unknown>) {
    setSending(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        say(data.error ?? "Falha ao enviar.");
        return null;
      }
      return data as { conversationId: string; userMessage: Message | null; assistantMessage: Message | null };
    } catch {
      say("Sem conexão com o servidor.");
      return null;
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const text = inp.trim();
    if (sending) return;
    if (!text && !files.length) return say("Escreva uma pergunta ou anexe um arquivo.");
    const docIds = files.map((f) => f.id);
    const tmpId = "tmp-" + Date.now();
    setMsgs((m) => [
      ...m,
      { id: tmpId, role: "user", content: text, status: "ok", document_ids: docIds },
      { id: tmpId + "-a", role: "assistant", content: "", status: "loading", document_ids: [] },
    ]);
    setInp("");
    setFiles([]);
    const data = await call({ conversationId: conv, caseId: caseF === "all" ? null : caseF, text, documentIds: docIds });
    if (!data) {
      setMsgs((m) => m.filter((x) => !x.id.startsWith(tmpId)));
      setInp(text);
      return;
    }
    setMsgs((m) => [...m.filter((x) => !x.id.startsWith(tmpId)), ...[data.userMessage, data.assistantMessage].filter((x): x is Message => !!x)]);
    if (!conv) {
      setConv(data.conversationId);
      setConvs((c) => [{ id: data.conversationId, title: (text || "Análise de documento").slice(0, 48), case_id: caseF === "all" ? null : caseF, updated_at: new Date().toISOString() }, ...c]);
    }
  }

  async function retry() {
    if (!conv) return;
    setMsgs((m) => {
      const copy = [...m];
      const last = copy[copy.length - 1];
      if (last?.role === "assistant") copy[copy.length - 1] = { ...last, status: "loading" };
      return copy;
    });
    const data = await call({ conversationId: conv, retry: true });
    setMsgs((m) => {
      const copy = m.slice(0, -1);
      return data?.assistantMessage ? [...copy, data.assistantMessage] : m.map((x, i) => (i === m.length - 1 ? { ...x, status: "error" } : x));
    });
  }

  const visibleConvs = convs.filter((c) => caseF === "all" || c.case_id === caseF);
  const caseName = (id: string | null) => cases.find((c) => c.id === id)?.name ?? "Sem caso";
  const current = convs.find((c) => c.id === conv);

  return (
    <div className={`as-wrap panel-${panel}`}>
      <style>{`
        .as-wrap { display: flex; height: calc(100vh - 56px); min-height: 560px; }
        .as-hist { width: 260px; flex: none; display: flex; flex-direction: column; gap: 12px; padding: 16px; border-right: 1px solid var(--line); background: var(--paper-2); overflow: auto; }
        .as-center { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #fff; }
        .as-src { width: 290px; flex: none; display: flex; flex-direction: column; gap: 14px; padding: 18px; border-left: 1px solid var(--line); background: var(--paper-2); overflow: auto; }
        @media (max-width: 979px) {
          .as-hist, .as-src { display: none; width: 100%; }
          .panel-hist .as-hist, .panel-src .as-src { display: flex; }
          .panel-hist .as-center, .panel-src .as-center { display: none; }
        }
      `}</style>

      <section className="as-hist">
        <button className="btn btn-dark" style={{ justifyContent: "flex-start" }} onClick={() => { setConv(null); setMsgs([]); setInp(""); setFiles([]); setPanel("none"); }}>
          <Icon name="plus" size={16} color="#fff" width={2} />
          Nova conversa
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="section-label">CASOS</span>
          <button onClick={() => setNcOpen((o) => !o)} style={{ fontSize: 12, color: "var(--bronze)", fontWeight: 600 }}>
            + Novo caso
          </button>
        </div>
        {ncOpen && (
          <div style={{ display: "flex", gap: 6 }}>
            <input className="input" value={ncName} onChange={(e) => setNcName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCase()} placeholder="Nome do caso" style={{ flex: 1, minWidth: 0, height: 34, fontSize: 13 }} />
            <button onClick={addCase} className="btn btn-gold" style={{ padding: "0 12px", fontSize: 12.5, borderRadius: 8 }}>
              Criar
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[{ id: "all", name: "Todos" }, ...cases].map((c) => {
            const on = caseF === c.id;
            return (
              <button key={c.id} onClick={() => setCaseF(c.id)} style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: on ? "var(--ink)" : "#fff", color: on ? "#fff" : "var(--ink)", border: `1px solid ${on ? "var(--ink)" : "var(--field)"}` }}>
                {c.name}
              </button>
            );
          })}
        </div>
        {cases.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>Nenhum caso criado. Crie um caso para organizar suas conversas.</div>}
        <span className="section-label" style={{ marginTop: 4 }}>
          CONVERSAS
        </span>
        {visibleConvs.map((c) => (
          <button key={c.id} onClick={() => openConv(c.id)} style={{ padding: "9px 11px", borderRadius: 9, background: c.id === conv ? "#F1EEE7" : "transparent", lineHeight: 1.35 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{caseName(c.case_id)}</div>
          </button>
        ))}
        {visibleConvs.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>Nenhuma conversa ainda.</div>}
      </section>

      <section className="as-center">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap" }}>
          <button className="only-narrow btn-outline" onClick={() => setPanel("hist")} style={{ fontSize: 12.5, fontWeight: 600, borderRadius: 8, padding: "6px 10px" }}>
            Conversas
          </button>
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current?.title ?? "Nova conversa"}</div>
          <span className={`tag${aiReady && enabled ? " tag-ok" : ""}`}>{!enabled ? "Módulo desativado" : aiReady ? "IA conectada" : "IA não conectada"}</span>
          <button className="only-narrow btn-outline" onClick={() => setPanel("src")} style={{ fontSize: 12.5, fontWeight: 600, borderRadius: 8, padding: "6px 10px" }}>
            Fontes
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
          {msgs.length === 0 && (
            <div style={{ margin: "auto", maxWidth: 520, textAlign: "center", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#F6EFE6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#B9965B" aria-hidden="true">
                  <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
                </svg>
              </div>
              <h2 className="serif" style={{ margin: 0, fontSize: 30, fontWeight: 600 }}>
                Assistente Jurídico
              </h2>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
                Pergunte, envie documentos e pesquise fundamentos. Conversas e arquivos ficam restritos à sua conta. O conteúdo da IA é sugestão e exige sua revisão.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => setInp(s)} style={{ border: "1px solid var(--chip)", borderRadius: 999, padding: "8px 14px", fontSize: 12.5, lineHeight: 1.3, whiteSpace: "nowrap" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 10.5, letterSpacing: ".1em", fontWeight: 600, color: "var(--blue)", alignSelf: "flex-end" }}>INFORMAÇÃO DO ADVOGADO</span>
                  {m.content && (
                    <div style={{ background: "var(--blue-bg)", borderRadius: "14px 14px 4px 14px", padding: "12px 16px", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.content}</div>
                  )}
                  {m.document_ids.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--muted)", alignSelf: "flex-end" }}>Anexos: {m.document_ids.map((d) => docNames[d] ?? "arquivo").join(", ")}</div>
                  )}
                </div>
              </div>
            ) : (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 720 }}>
                <span style={{ fontSize: 10.5, letterSpacing: ".1em", fontWeight: 600, color: "var(--bronze)" }}>SUGESTÃO DA IA</span>
                <div style={{ border: "1px solid var(--ai-line)", background: "var(--ai-bg)", borderRadius: "14px 14px 14px 4px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {m.status === "loading" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "var(--muted-2)" }}>
                      <span className="spinner" />
                      Consultando o assistente…
                    </div>
                  )}
                  {m.status === "ok" && <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>}
                  {m.status === "error" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--red)" }}>Assistente indisponível</div>
                      <div style={{ fontSize: 13, color: "var(--muted-2)", lineHeight: 1.55 }}>{m.content}</div>
                      {i === msgs.length - 1 && (
                        <button onClick={retry} disabled={sending} style={{ alignSelf: "flex-start", border: "1px solid #D9C49B", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, color: "var(--bronze)" }}>
                          Tentar novamente
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Copiar", "Salvar em documento", "Usar na petição", "Ver fundamentos"].map((a) => {
                    const ok = m.status === "ok";
                    return (
                      <button
                        key={a}
                        disabled={!ok}
                        title={ok ? a : "Disponível quando houver resposta"}
                        onClick={() => {
                          if (a === "Copiar") navigator.clipboard.writeText(m.content).then(() => say("Resposta copiada."));
                          else if (a === "Ver fundamentos") setPanel("src");
                          else say(soonMessage(a));
                        }}
                        style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: ok ? "var(--ink)" : "var(--faint)" }}
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>

        <div style={{ padding: "14px 20px 18px", borderTop: "1px solid var(--line-2)", display: "flex", flexDirection: "column", gap: 8 }}>
          {(files.length > 0 || uploading > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {files.map((f) => (
                <span key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, background: "var(--blue-bg)", borderRadius: 8, padding: "5px 10px" }}>
                  {f.name}
                  <button
                    aria-label="Remover"
                    onClick={async () => {
                      setFiles((x) => x.filter((y) => y.id !== f.id));
                      if (supabase) await removeDocument(supabase, f);
                    }}
                    style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {uploading > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                  <span className="spinner" /> Enviando…
                </span>
              )}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, border: "1px solid var(--field)", borderRadius: 14, padding: "8px 8px 8px 14px" }}>
            <textarea
              value={inp}
              onChange={(e) => setInp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="Pergunte algo ou descreva a situação…"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, resize: "none", fontSize: 14, lineHeight: 1.5, background: "transparent" }}
            />
            <input ref={fileRef} type="file" accept=".pdf,.docx" multiple onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} aria-label="Anexar PDF ou DOCX" title="Anexar PDF ou DOCX" style={{ width: 38, height: 38, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Icon name="clip" size={19} color="#64666B" width={1.8} />
            </button>
            <button
              onClick={send}
              disabled={sending || uploading > 0}
              aria-label="Enviar"
              style={{ width: 40, height: 40, borderRadius: 10, background: inp.trim() || files.length ? "var(--bronze)" : "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}
            >
              {sending ? <span className="spinner" style={{ borderColor: "#fff", borderTopColor: "transparent" }} /> : <Icon name="arrow" color="#fff" width={2} />}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
            Aceita {Object.entries(ACCEPTED).filter(([k]) => ASSISTANT_TYPES.includes(k)).map(([, v]) => v).join(" e ")} (PDF é lido pela IA; DOCX ainda não). Toda resposta é sugestão e deve ser revisada por você.
          </div>
        </div>
      </section>

      <section className="as-src">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>
            Fontes e fundamentos
          </span>
          <button className="only-narrow" onClick={() => setPanel("none")} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--bronze)" }}>
            Voltar
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {LEGEND.map((g) => (
            <div key={g.l} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: g.c, marginTop: 3, flex: "none" }} />
              <span>
                <b>{g.l}</b>
                <br />
                <span style={{ color: "var(--muted)" }}>{g.s}</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, fontSize: 12, letterSpacing: ".1em", fontWeight: 600, color: "var(--muted)" }}>NESTA CONVERSA</div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, textAlign: "center", border: "1px dashed var(--chip)", borderRadius: 12, padding: "18px 12px" }}>
          Nenhuma fonte verificada. A pesquisa em bases jurídicas oficiais ainda não está conectada; referências citadas pela IA devem ser conferidas por você.
        </div>
      </section>
    </div>
  );
}
