// Estrutura-base da peça e conversão do texto da IA para o editor.

export type PetitionForm = {
  tipo: string;
  area: string;
  trib: string;
  uf: string;
  vara: string;
  cnj: string;
  autor: string;
  reu: string;
  fatos: string;
  pedidos: string;
};

export const EMPTY_FORM: PetitionForm = { tipo: "", area: "", trib: "", uf: "", vara: "", cnj: "", autor: "", reu: "", fatos: "", pedidos: "" };

export function esc(t: string | null | undefined) {
  return String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const H = "font-family:'Cormorant Garamond Variable',serif;font-size:19px;font-weight:700;margin:22px 0 6px;text-align:left";
const P = "margin:0 0 10px;text-indent:2em";

export function skeleton(f: PetitionForm) {
  const e = esc;
  return (
    `<p style="text-align:center;margin:0 0 14px"><b>EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ${e(f.vara) || "[VARA/COMPETÊNCIA]"} — ${e(f.trib) || "[TRIBUNAL]"}${f.uf ? " / " + e(f.uf) : ""}</b></p>` +
    `<p style="margin:0 0 14px">${f.cnj ? "Processo nº " + e(f.cnj) : "Processo nº [número CNJ, se houver]"}</p>` +
    `<h1 style="text-align:center;font-size:18px;margin:18px 0">${e((f.tipo || "[Tipo de peça]").toUpperCase())}</h1>` +
    `<h2 style="${H}">QUALIFICAÇÃO DAS PARTES</h2><p style="${P}">${e(f.autor) || "[Qualificação do autor/requerente]"}, em face de ${e(f.reu) || "[qualificação do réu/requerido]"}.</p>` +
    `<h2 style="${H}">DOS FATOS</h2><p style="${P}">${e(f.fatos).replace(/\n/g, "<br>") || "[Descrever os fatos]"}</p>` +
    `<h2 style="${H}">DO DIREITO</h2><p style="${P}">[Inserir fundamentos jurídicos verificados, com fonte.]</p>` +
    `<h2 style="${H}">DOS PEDIDOS</h2><p style="${P}">${e(f.pedidos).replace(/\n/g, "<br>") || "[Listar os pedidos]"}</p>` +
    `<p style="${P}">Nestes termos, pede deferimento.</p><p style="${P}">[Local], [data].</p><p style="${P}">[Nome do advogado] — OAB/[UF] [número]</p>`
  );
}

/** Linhas inteiramente em maiúsculas viram títulos; o resto vira parágrafo. Todo texto é escapado. */
export function aiTextToHtml(text: string) {
  return text
    .split(/\n{1,}/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const isTitle = l.length <= 90 && /[A-ZÀ-Ú]/.test(l) && l === l.toUpperCase();
      return isTitle ? `<h2 style="${H}">${esc(l)}</h2>` : `<p style="${P}">${esc(l)}</p>`;
    })
    .join("");
}
