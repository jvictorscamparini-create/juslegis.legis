"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { LEGEND } from "@/components/workspace/legend";
import { removeDocument, uploadDocument, type UploadedDoc } from "@/components/workspace/uploads";
import { createClient } from "@/lib/supabase/client";
import type { VerifiedLegalResearch } from "@/lib/legal-research";
import { aiTextToHtml, EMPTY_FORM, skeleton, type PetitionForm } from "./skeleton";

type Version = { id: string; label: string; content_html: string };
type Draft = { id: string; title: string; form: Partial<PetitionForm>; updated_at: string };

const TIPOS = ["Petição inicial", "Contestação", "Réplica", "Recurso", "Manifestação", "Cumprimento de sentença", "Contrato", "Parecer jurídico"];
const AREAS = ["Cível", "Trabalhista", "Penal", "Tributário", "Previdenciário", "Consumidor", "Administrativo", "Família e Sucessões", "Empresarial"];
const SN = ["Tipo de peça", "Área do Direito", "Tribunal", "Fatos", "Documentos", "Fundamentos", "Gerar minuta", "Revisar", "Exportar"];
const HELP = [
  "Selecione o modelo de peça a elaborar.",
  "A área orienta a estrutura e os fundamentos.",
  "Informe onde a peça será protocolada.",
  "Informe as partes e descreva os fatos relevantes.",
  "Anexe os documentos de apoio. Eles ficam restritos à sua conta.",
  "Registre pedidos e fundamentos que deseja incluir.",
  "Confira os dados antes de gerar.",
];
const TRIBS = ["Justiça Estadual", "Justiça Federal", "Justiça do Trabalho", "Tribunais Superiores"];
const PET_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
const TOOLS: [string, string, string][] = [
  ["M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8", "Negrito", "bold"],
  ["M19 4h-9M14 20H5M15 4 9 20", "Itálico", "italic"],
  ["M6 4v6a6 6 0 0 0 12 0V4M4 20h16", "Sublinhado", "underline"],
  ["M21 5H3M15 12H3M17 19H3", "Alinhar à esquerda", "justifyLeft"],
  ["M21 5H3M17 12H7M19 19H5", "Centralizar", "justifyCenter"],
  ["M3 5h18M3 12h18M3 19h18", "Justificar", "justifyFull"],
  ["M10 12h11M10 18h11M10 6h11M4 10h2M4 6h1v4M6 18H4c0-1 2-2 2-3s-1-1.5-2-1", "Lista numerada", "insertOrderedList"],
  ["M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13", "Desfazer", "undo"],
  ["M21 7v6h-6M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13", "Refazer", "redo"],
];

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: "24px 26px", boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 18, maxWidth: 880, width: "100%", alignSelf: "center" };

export default function PetitionsView({ userId, aiReady, initialId }: { userId: string; aiReady: boolean; initialId: string | null }) {
  const supabase = createClient();
  const say = useToast();
  const [id, setId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [step, setStepState] = useState(1);
  const [f, setF] = useState<PetitionForm>(EMPTY_FORM);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [funds, setFunds] = useState<string[]>([]);
  const [fundIn, setFundIn] = useState("");
  const [legalTopic, setLegalTopic] = useState("");
  const [verifiedResearch, setVerifiedResearch] = useState<VerifiedLegalResearch | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [gen, setGen] = useState<"idle" | "load" | "err">("idle");
  const [genMsg, setGenMsg] = useState("");
  const [rtab, setRtab] = useState(1);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [citeMsg, setCiteMsg] = useState(false);
  const [expMsg, setExpMsg] = useState(false);
  const [uploading, setUploading] = useState(0);
  const docHtml = useRef("");
  const ed = useRef<HTMLDivElement | null>(null);
  const pfileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (petitionId: string | null) => {
      if (!supabase) return;
      const { data: list } = await supabase.from("petitions").select("id,title,form,updated_at").order("updated_at", { ascending: false }).limit(30);
      setDrafts((list ?? []) as Draft[]);
      if (!petitionId) return;
      const { data: p } = await supabase.from("petitions").select("*").eq("id", petitionId).maybeSingle();
      if (!p) return;
      setId(p.id);
      setF({ ...EMPTY_FORM, ...(p.form ?? {}) });
      setFunds(p.foundations ?? []);
      setStepState(p.step ?? 1);
      docHtml.current = p.content_html ?? "";
      if (ed.current) ed.current.innerHTML = docHtml.current;
      const { data: sourceRecord } = await supabase
        .from("petition_verified_sources")
        .select("topic,categories,request_hash,consulted_at,sources")
        .eq("petition_id", p.id)
        .maybeSingle();
      const research = sourceRecord
        ? {
            topic: sourceRecord.topic,
            categories: sourceRecord.categories,
            request_hash: sourceRecord.request_hash,
            consulted_at: sourceRecord.consulted_at,
            sources: sourceRecord.sources,
          } as VerifiedLegalResearch
        : null;
      setVerifiedResearch(research);
      setLegalTopic(research?.topic ?? "");
      if (p.document_ids?.length) {
        const { data: d } = await supabase.from("documents").select("id,name,storage_path").in("id", p.document_ids);
        setDocs((d ?? []) as UploadedDoc[]);
      } else setDocs([]);
      const { data: v } = await supabase.from("petition_versions").select("id,label,content_html").eq("petition_id", p.id).order("created_at", { ascending: false });
      setVersions((v ?? []) as Version[]);
    },
    [supabase],
  );

  useEffect(() => {
    load(initialId);
  }, [load, initialId]);

  /** Grava o rascunho (cria na primeira vez). RLS garante que só o dono escreve. */
  async function persist(extra: { step?: number; content_html?: string } = {}): Promise<string | null> {
    if (!supabase) return null;
    if (ed.current) docHtml.current = ed.current.innerHTML;
    const row = {
      title: f.tipo || "Nova petição",
      form: f,
      foundations: funds,
      document_ids: docs.map((d) => d.id),
      content_html: extra.content_html ?? docHtml.current,
      step: extra.step ?? step,
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { error } = await supabase.from("petitions").update(row).eq("id", id);
      if (error) say("Não foi possível salvar o rascunho.");
      return id;
    }
    const { data, error } = await supabase.from("petitions").insert(row).select("id").single();
    if (error || !data) {
      say("Não foi possível salvar o rascunho.");
      return null;
    }
    setId(data.id);
    window.history.replaceState(null, "", `/app/peticoes?id=${data.id}`);
    return data.id as string;
  }

  function goStep(n: number) {
    if (ed.current) docHtml.current = ed.current.innerHTML;
    if (n >= 8 && !docHtml.current) docHtml.current = skeleton(f);
    setStepState(n);
    persist({ step: n, content_html: docHtml.current });
  }

  const edRef = (el: HTMLDivElement | null) => {
    ed.current = el;
    if (el && !el.dataset.init) {
      el.dataset.init = "1";
      el.innerHTML = docHtml.current;
    }
  };

  function newPetition() {
    setId(null);
    setF(EMPTY_FORM);
    setFunds([]);
    setLegalTopic("");
    setVerifiedResearch(null);
    setResearchError("");
    setDocs([]);
    setVersions([]);
    setStepState(1);
    setGen("idle");
    docHtml.current = "";
    window.history.replaceState(null, "", "/app/peticoes");
  }

  async function callAi(action: "generate" | "review" | "rewrite", selection?: string) {
    const pid = await persist();
    if (!pid) return null;
    const res = await fetch("/api/petitions/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ petitionId: pid, action, selection, currentText: ed.current?.innerText ?? "", topic: legalTopic.trim() }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Sem conexão com o servidor." };
    return res?.ok ? { ok: true as const, text: data.text as string } : { ok: false as const, text: (data.error as string) ?? "Falha na IA." };
  }

  async function researchSources() {
    if (researchBusy) return;
    const topic = legalTopic.trim();
    if (topic.length < 3) return setResearchError("Informe o tema jurídico sem nomes ou dados pessoais.");
    const pid = await persist();
    if (!pid) return;
    setResearchBusy(true);
    setResearchError("");
    const res = await fetch("/api/legal/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ petitionId: pid, topic }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "Sem conexão com o servidor." };
    setResearchBusy(false);
    if (!res?.ok) {
      setResearchError(data.error ?? "Não foi possível pesquisar fontes oficiais.");
      return;
    }
    setVerifiedResearch(data.research as VerifiedLegalResearch);
    say("Fontes oficiais localizadas e URLs verificadas.");
  }

  async function generate() {
    setGen("load");
    const r = await callAi("generate");
    if (!r) return setGen("idle");
    if (!r.ok) {
      setGenMsg(r.text);
      return setGen("err");
    }
    setGen("idle");
    docHtml.current = aiTextToHtml(r.text);
    if (ed.current) ed.current.innerHTML = docHtml.current;
    setStepState(8);
    persist({ step: 8, content_html: docHtml.current });
    say("Minuta gerada. Revise todo o conteúdo antes de usar.");
  }

  async function review() {
    setAiBusy(true);
    const r = await callAi("review");
    setAiBusy(false);
    if (r) setAiMsg(r);
  }

  async function rewrite() {
    const sel = window.getSelection();
    const text = sel && ed.current?.contains(sel.anchorNode) ? sel.toString() : "";
    if (!text.trim()) return setAiMsg({ ok: false, text: "Selecione um trecho no editor antes de pedir a reescrita." });
    const range = sel!.getRangeAt(0).cloneRange();
    setAiBusy(true);
    const r = await callAi("rewrite", text);
    setAiBusy(false);
    if (!r) return;
    if (!r.ok) return setAiMsg(r);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
    document.execCommand("insertText", false, r.text);
    setAiMsg({ ok: true, text: "Trecho reescrito pela IA. Revise antes de salvar." });
  }

  async function saveVersion() {
    const pid = await persist();
    if (!pid || !supabase) return;
    const d = new Date();
    const label = `Versão ${versions.length + 1} · ${d.toLocaleDateString("pt-BR")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const { data, error } = await supabase.from("petition_versions").insert({ petition_id: pid, label, content_html: docHtml.current }).select("id,label,content_html").single();
    if (error || !data) return say("Não foi possível salvar a versão.");
    setVersions((v) => [data as Version, ...v]);
    say("Versão salva.");
  }

  function exportPdf() {
    const html = ed.current?.innerHTML ?? docHtml.current;
    const w = window.open("", "_blank");
    if (!w) return say("Permita pop-ups para exportar o PDF.");
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${f.tipo || "Petição"}</title><style>@page{size:A4;margin:2.5cm}body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.7;text-align:justify;color:#17191C}</style></head><body>${html}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  async function onPfiles(list: FileList | null) {
    if (!list || !supabase) return;
    for (const file of Array.from(list)) {
      setUploading((n) => n + 1);
      const r = await uploadDocument(supabase, userId, file, "petition", PET_TYPES);
      setUploading((n) => n - 1);
      if (r.ok) setDocs((d) => [...d, r.doc]);
      else say(r.error);
    }
  }

  const cmd = (c: string, v?: string) => {
    ed.current?.focus();
    document.execCommand(c, false, v);
  };
  const setField = (k: keyof PetitionForm, v: string) => setF((x) => ({ ...x, [k]: v }));
  const done = [f.tipo, f.area, f.trib, f.fatos, docs.length, funds.length || f.pedidos];
  const summary: [string, string][] = [
    ["Tipo de peça", f.tipo],
    ["Área do Direito", f.area],
    ["Tribunal", [f.trib, f.uf].filter(Boolean).join(" · ")],
    ["Partes", [f.autor, f.reu].filter(Boolean).join(" × ")],
    ["Fatos", f.fatos ? "Informados" : ""],
    ["Documentos", docs.length ? `${docs.length} anexado(s)` : ""],
    ["Fundamentos", funds.length ? `${funds.length} (não verificados)` : ""],
  ];

  const choices = step === 1 ? { k: "tipo" as const, list: TIPOS } : step === 2 ? { k: "area" as const, list: AREAS } : null;
  const input = (k: keyof PetitionForm, ph: string) => <input className="input" value={f[k]} onChange={(e) => setField(k, e.target.value)} placeholder={ph} />;
  const area = (k: keyof PetitionForm, ph: string) => <textarea className="textarea" rows={6} value={f[k]} onChange={(e) => setField(k, e.target.value)} placeholder={ph} />;

  return (
    <div style={{ padding: "20px 28px 40px", display: "flex", flexDirection: "column", gap: 18, width: "100%", maxWidth: 1320, margin: "0 auto" }}>
      <style>{`
        .ed-grid { display: grid; gap: 16px; align-items: start; grid-template-columns: minmax(0,1fr); }
        .ed-outline { display: none; }
        @media (min-width: 1200px) { .ed-grid { grid-template-columns: 190px minmax(0,1fr) 290px; } .ed-outline { display: flex; } }
      `}</style>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="select"
          value={id ?? ""}
          onChange={(e) => (e.target.value ? load(e.target.value) : newPetition())}
          style={{ minWidth: 220, height: 34, fontSize: 12.5 }}
          aria-label="Minhas petições"
        >
          <option value="">{id ? "Nova petição" : "Nova petição (não salva)"}</option>
          {drafts.map((d) => (
            <option key={d.id} value={d.id}>
              {(d.form?.tipo || d.title) + " · " + new Date(d.updated_at).toLocaleDateString("pt-BR")}
            </option>
          ))}
        </select>
        <button className="btn btn-outline" style={{ padding: "7px 12px", fontSize: 12.5 }} onClick={newPetition}>
          + Nova petição
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{id ? "Rascunho salvo na sua conta." : "O rascunho é salvo ao avançar uma etapa."}</span>
      </div>

      <div style={{ display: "flex", gap: 6, overflow: "auto", paddingBottom: 4 }}>
        {SN.map((l, i) => {
          const n = i + 1;
          const a = n === step;
          const d = n < 7 && !!done[i];
          return (
            <button
              key={l}
              onClick={() => goStep(n)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px 7px 8px", borderRadius: 999, border: `1px solid ${a ? "var(--ink)" : "var(--chip)"}`, background: a ? "var(--ink)" : "#fff", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 600, color: a ? "#fff" : "var(--ink)" }}
            >
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: a ? "var(--gold)" : d ? "var(--green)" : "var(--tag-bg)", color: a ? "var(--ink)" : d ? "#fff" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
                {d && !a ? "✓" : n}
              </span>
              {l}
            </button>
          );
        })}
      </div>

      {step <= 7 && (
        <section style={cardStyle}>
          <div>
            <h2 className="serif" style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>
              {SN[step - 1]}
            </h2>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{HELP[step - 1]}</div>
          </div>

          {choices && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 10 }}>
              {choices.list.map((l) => {
                const on = f[choices.k] === l;
                return (
                  <button key={l} onClick={() => setField(choices.k, l)} style={{ padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${on ? "var(--gold)" : "var(--chip)"}`, background: on ? "var(--ai-bg)" : "#fff", fontSize: 14, fontWeight: 600 }}>
                    {l}
                  </button>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
              <label className="field">
                Justiça / tribunal
                <select className="select" value={f.trib} onChange={(e) => setField("trib", e.target.value)}>
                  <option value="">Selecione</option>
                  {TRIBS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">UF / comarca{input("uf", "Ex.: GO / Goiânia")}</label>
              <label className="field">Vara ou competência{input("vara", "Informe a vara ou o juízo")}</label>
              <label className="field">Número CNJ (se houver){input("cnj", "0000000-00.0000.0.00.0000")}</label>
            </div>
          )}
          {step === 4 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
              <label className="field">Autor / requerente{input("autor", "Nome e qualificação")}</label>
              <label className="field">Réu / requerido{input("reu", "Nome e qualificação")}</label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                Fatos relevantes{area("fatos", "Descreva os fatos com suas palavras.")}
              </label>
            </div>
          )}
          {step === 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input ref={pfileRef} type="file" accept=".pdf,.docx,.txt" multiple onChange={(e) => { onPfiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
              <button onClick={() => pfileRef.current?.click()} style={{ border: "1.5px dashed #CDB78A", borderRadius: 14, padding: 26, textAlign: "center", fontSize: 13.5, color: "var(--bronze)", fontWeight: 600, background: "var(--ai-bg)" }}>
                Selecionar arquivos (PDF, DOCX ou TXT)
              </button>
              {docs.map((d) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13 }}>
                  <span style={{ flex: 1 }}>{d.name}</span>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--blue-bg)", color: "var(--blue)" }}>Enviado por você</span>
                  <button aria-label="Remover" onClick={async () => { setDocs((x) => x.filter((y) => y.id !== d.id)); if (supabase) await removeDocument(supabase, d); }} style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1 }}>
                    ×
                  </button>
                </div>
              ))}
              {uploading > 0 && <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--muted)" }}><span className="spinner" /> Enviando…</div>}
              {!docs.length && !uploading && <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: 6 }}>Nenhum documento anexado.</div>}
            </div>
          )}
          {step === 6 && (
            <>
              <label className="field">Pedidos{area("pedidos", "Liste os pedidos da peça.")}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Fundamentos</div>
                <div style={{ border: "1px dashed var(--chip)", borderRadius: 12, padding: 14, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                  Fundamentos informados por você continuam marcados como não verificados. A IA só poderá elaborar ou revisar a minuta depois que uma fonte oficial compatível for localizada e seu link responder.
                </div>
                <label className="field">
                  Tema jurídico para pesquisar (sem nomes ou dados pessoais)
                  <input className="input" value={legalTopic} onChange={(e) => setLegalTopic(e.target.value)} maxLength={300} placeholder="Ex.: responsabilidade civil por falha na prestação de serviço" />
                </label>
                <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
                  O tema, a área, o tipo de peça e os fundamentos informados serão enviados à OpenAI para busca limitada a domínios oficiais. Fatos, partes e documentos da petição não são enviados nesta pesquisa.
                </div>
                <button className="btn btn-outline" onClick={researchSources} disabled={researchBusy || legalTopic.trim().length < 3} style={{ alignSelf: "flex-start" }}>
                  {researchBusy && <span className="spinner" />}
                  {researchBusy ? "Pesquisando fontes oficiais…" : "Pesquisar e validar fontes"}
                </button>
                {researchError && <div className="alert-err" role="status">{researchError}</div>}
                {verifiedResearch && (
                  <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {verifiedResearch.sources.length} fonte(s) oficial(is) com URL respondendo · consultadas em {new Date(verifiedResearch.consulted_at).toLocaleString("pt-BR")}
                    </div>
                    {verifiedResearch.sources.map((source, i) => (
                      <div key={`${source.url}-${i}`} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                        <span style={{ fontWeight: 600 }}>[{i + 1}] {source.title}</span>
                        <div><a href={source.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", overflowWrap: "anywhere" }}>{source.url}</a></div>
                      </div>
                    ))}
                    {legalTopic.trim() !== verifiedResearch.topic && <div className="alert-err">O tema mudou. Pesquise novamente antes de gerar ou revisar a minuta.</div>}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" value={fundIn} onChange={(e) => setFundIn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && fundIn.trim()) { setFunds((x) => [...x, fundIn.trim()]); setFundIn(""); } }} placeholder="Ex.: dispositivo legal, súmula ou precedente que você deseja citar" style={{ flex: 1, minWidth: 0 }} />
                  <button className="btn btn-dark" style={{ padding: "0 16px", fontSize: 13, borderRadius: 9 }} onClick={() => { if (fundIn.trim()) { setFunds((x) => [...x, fundIn.trim()]); setFundIn(""); } }}>
                    Adicionar
                  </button>
                </div>
                {funds.map((u, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{u}</span>
                    <span className="tag" style={{ fontSize: 11, padding: "2px 8px" }}>Não verificado</span>
                    <button aria-label="Remover" onClick={() => setFunds((x) => x.filter((_, j) => j !== i))} style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1 }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {step === 7 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ border: "1px solid var(--line)", borderRadius: 12 }}>
                {summary.map(([l, v], i) => (
                  <div key={l} style={{ display: "flex", gap: 12, padding: "10px 14px", borderTop: i ? "1px solid var(--line-2)" : 0, fontSize: 13 }}>
                    <span style={{ width: 150, flex: "none", color: "var(--muted)" }}>{l}</span>
                    <span style={{ flex: 1, color: v ? "var(--ink)" : "var(--faint)" }}>{v || "Não informado"}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-gold" onClick={generate} disabled={gen === "load" || !verifiedResearch || verifiedResearch.topic !== legalTopic.trim()} title={aiReady ? "" : "IA não conectada"}>
                  Gerar minuta com IA
                </button>
                <button className="btn btn-outline" onClick={() => goStep(8)}>
                  Abrir estrutura no editor
                </button>
              </div>
              {gen === "load" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "var(--muted-2)" }}>
                  <span className="spinner" />
                  Gerando minuta…
                </div>
              )}
              {gen === "err" && <div className="alert-err">Geração indisponível: {genMsg} Você pode abrir a estrutura da peça no editor e redigir manualmente.</div>}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--line-2)", paddingTop: 16 }}>
            <button className="btn-ghost" onClick={() => goStep(Math.max(1, step - 1))} style={{ visibility: step > 1 ? "visible" : "hidden" }}>
              Voltar
            </button>
            {step < 7 && (
              <button className="btn btn-dark" onClick={() => goStep(step + 1)} style={{ padding: "10px 22px", fontSize: 13 }}>
                Continuar
              </button>
            )}
          </div>
        </section>
      )}

      {step === 8 && (
        <div className="ed-grid">
          <section className="ed-outline" style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-card)", flexDirection: "column", gap: 8 }}>
            <div className="section-label">ESTRUTURA</div>
            {["Endereçamento", "Qualificação das partes", "Dos fatos", "Do direito", "Dos pedidos", "Fechamento"].map((h) => (
              <div key={h} style={{ fontSize: 13, padding: "5px 0", color: "var(--muted-2)" }}>{h}</div>
            ))}
            <div style={{ borderTop: "1px solid var(--line-2)", marginTop: 8, paddingTop: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Colchetes [ ] indicam campos a completar por você.</div>
          </section>
          <section style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: "8px 10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, boxShadow: "var(--shadow-card)" }}>
              <select onChange={(e) => cmd("formatBlock", e.target.value)} className="select" style={{ height: 32, fontSize: 12.5, padding: "0 8px", borderRadius: 8 }} aria-label="Estilo do bloco">
                <option value="P">Parágrafo</option>
                <option value="H2">Título</option>
                <option value="H3">Subtítulo</option>
              </select>
              {TOOLS.map(([d, tip, c]) => (
                <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(c)} title={tip} aria-label={tip} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#17191C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={d} />
                  </svg>
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button className="btn btn-outline" style={{ padding: "6px 12px", fontSize: 12.5, borderRadius: 8 }} onClick={saveVersion}>
                Salvar versão
              </button>
              <button className="btn btn-dark" style={{ padding: "7px 14px", fontSize: 12.5, borderRadius: 8 }} onClick={() => goStep(9)}>
                Exportar
              </button>
            </div>
            <div style={{ background: "#E9E6DF", borderRadius: 12, padding: "20px 12px", overflow: "auto" }}>
              <div
                contentEditable
                suppressContentEditableWarning
                ref={edRef}
                onBlur={() => persist()}
                style={{ background: "#fff", width: "100%", maxWidth: 794, minHeight: 900, margin: "0 auto", padding: "56px 64px", fontFamily: "'Times New Roman',Times,serif", fontSize: 16, lineHeight: 1.7, outline: 0, boxShadow: "0 2px 12px rgba(23,25,28,.12)", textAlign: "justify" }}
              />
            </div>
          </section>
          <section style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 4, background: "var(--paper)", borderRadius: 10, padding: 3 }}>
              {(["Fundamentos", "IA", "Versões"] as const).map((l, i) => (
                <button key={l} onClick={() => setRtab(i + 1)} style={{ flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: rtab === i + 1 ? "#fff" : "transparent", color: rtab === i + 1 ? "var(--ink)" : "var(--muted)" }}>
                  {l}
                </button>
              ))}
            </div>
            {rtab === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {LEGEND.map((g) => (
                  <div key={g.l} style={{ display: "flex", gap: 8, fontSize: 11.5, alignItems: "center" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: g.c, flex: "none" }} />
                    {g.l}
                  </div>
                ))}
                <div style={{ borderTop: "1px solid var(--line-2)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {funds.map((u, i) => (
                    <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, fontSize: 12.5, lineHeight: 1.45, display: "flex", flexDirection: "column", gap: 6 }}>
                      <span>{u}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Informado por você · não verificado</span>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertText", ` ${u} `)} className="btn-link" style={{ alignSelf: "flex-start", fontSize: 12 }}>
                        Inserir no texto
                      </button>
                    </div>
                  ))}
                  {!funds.length && <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>Nenhum fundamento adicionado. Registre-os na etapa 6.</div>}
                </div>
                <button className="btn btn-outline" style={{ fontSize: 12.5, borderRadius: 9 }} onClick={() => setCiteMsg(true)}>
                  Verificar citações
                </button>
                {citeMsg && <div className="alert-err" style={{ fontSize: 12 }}>Verificação indisponível: a base jurídica não está conectada. Nenhuma citação foi confirmada.</div>}
              </div>
            )}
            {rtab === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn btn-outline" style={{ fontSize: 12.5, borderRadius: 9 }} onClick={review} disabled={aiBusy}>
                  Revisar minuta
                </button>
                <button className="btn btn-outline" style={{ fontSize: 12.5, borderRadius: 9 }} onMouseDown={(e) => e.preventDefault()} onClick={rewrite} disabled={aiBusy}>
                  Reescrever trecho selecionado
                </button>
                {aiBusy && <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--muted-2)" }}><span className="spinner" /> Consultando a IA…</div>}
                {aiMsg && (
                  <div className={aiMsg.ok ? "" : "alert-err"} style={aiMsg.ok ? { border: "1px solid var(--ai-line)", background: "var(--ai-bg)", borderRadius: 9, padding: 10, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap" } : { fontSize: 12 }}>
                    {aiMsg.ok && <div style={{ fontSize: 10.5, letterSpacing: ".1em", fontWeight: 600, color: "var(--bronze)", marginBottom: 6 }}>SUGESTÃO DA IA</div>}
                    {aiMsg.text}
                  </div>
                )}
              </div>
            )}
            {rtab === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {versions.map((w) => (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 10, padding: "9px 10px", fontSize: 12.5 }}>
                    <span style={{ flex: 1 }}>{w.label}</span>
                    <button className="btn-link" onClick={() => { docHtml.current = w.content_html; if (ed.current) ed.current.innerHTML = w.content_html; persist({ content_html: w.content_html }); say("Versão restaurada."); }}>
                      Restaurar
                    </button>
                  </div>
                ))}
                {!versions.length && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Nenhuma versão salva.</div>}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, borderTop: "1px solid var(--line-2)", paddingTop: 10 }}>Toda minuta exige revisão humana do advogado.</div>
          </section>
        </div>
      )}

      {step === 9 && (
        <section style={{ ...cardStyle, gap: 16 }}>
          <div>
            <h2 className="serif" style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>
              Salvar e exportar
            </h2>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Confirme a revisão antes de exportar.</div>
          </div>
          {/* Editor oculto mantém o conteúdo disponível para a impressão */}
          <div ref={edRef} style={{ display: "none" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            <button onClick={() => setExpMsg(true)} style={{ border: "1.5px solid var(--chip)", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Documento Word (DOCX)</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Editável, para ajustes finais.</span>
            </button>
            <button onClick={exportPdf} style={{ border: "1.5px solid var(--chip)", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>PDF</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Abre a impressão do navegador: escolha “Salvar como PDF”.</span>
            </button>
          </div>
          {expMsg && <div className="alert-err" style={{ fontSize: 13 }}>Exportação DOCX ainda não disponível: depende da geração do arquivo no backend. Nada foi exportado. Use o PDF.</div>}
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>Toda minuta deve ser revisada pelo advogado responsável antes do protocolo.</div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line-2)", paddingTop: 16 }}>
            <button className="btn-ghost" onClick={() => goStep(8)}>
              <Icon name="back" size={14} /> Voltar ao editor
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
