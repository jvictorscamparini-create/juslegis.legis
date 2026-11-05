"use client";

import { useMemo, useState } from "react";
import { brl, custas, honorariosContratuais, honorariosFazenda, honorariosPrivados, SALARIO_MINIMO_2026 } from "@/lib/honorarios";

type Tab = "sucumbencia" | "contratuais" | "custas";

const card: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-card)" };
const resultBox: React.CSSProperties = { borderRadius: 14, background: "var(--bg, #f7f5f0)", padding: 16 };

/** Aceita "1.234,56", "1234.56" ou "1234". */
function money(v: string): number {
  const s = v.trim();
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function attempt<T>(fn: () => T): { ok: true; r: T } | { ok: false; error: string } {
  try {
    return { ok: true, r: fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Dados inválidos." };
  }
}

function Big({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, margin: "2px 0 4px" }}>{value}</div>
      {note && <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>{note}</div>}
    </div>
  );
}

export default function CalculadorasClient() {
  const [tab, setTab] = useState<Tab>("sucumbencia");
  return (
    <section style={card}>
      <div className="tabs" role="tablist">
        {([["sucumbencia", "Honorários de sucumbência"], ["contratuais", "Honorários contratuais"], ["custas", "Custas"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)} style={{ background: "none", border: 0, cursor: "pointer" }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 18, maxWidth: 640 }}>
        {tab === "sucumbencia" && <Sucumbencia />}
        {tab === "contratuais" && <Contratuais />}
        {tab === "custas" && <Custas />}
      </div>
    </section>
  );
}

function Sucumbencia() {
  const [base, setBase] = useState("100.000,00");
  const [fazenda, setFazenda] = useState(false);
  const [percent, setPercent] = useState("10");
  const [recursal, setRecursal] = useState("0");
  const [sm, setSm] = useState(String(SALARIO_MINIMO_2026));
  const [position, setPosition] = useState("0");

  const privado = useMemo(() => attempt(() => honorariosPrivados({ base: money(base), percent: Number(percent), recursalPercent: Number(recursal) })), [base, percent, recursal]);
  const publico = useMemo(() => attempt(() => honorariosFazenda({ base: money(base), salarioMinimo: money(sm), position: Number(position) / 100 })), [base, sm, position]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="field">
        Valor da condenação, do proveito econômico ou da causa (R$)
        <input className="input" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
        <input type="checkbox" checked={fazenda} onChange={(e) => setFazenda(e.target.checked)} />
        A Fazenda Pública é parte (faixas do art. 85, § 3º)
      </label>

      {!fazenda ? (
        <>
          <div style={{ display: "flex", gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>
              Percentual fixado (10% a 20%)
              <input className="input" type="number" min={10} max={20} step={0.5} value={percent} onChange={(e) => setPercent(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              Acréscimo recursal (%)
              <input className="input" type="number" min={0} max={10} step={0.5} value={recursal} onChange={(e) => setRecursal(e.target.value)} />
            </label>
          </div>
          <div style={resultBox}>
            {privado.ok ? (
              <Big
                label={`Honorários (${privado.r.percentApplied}%)`}
                value={brl(privado.r.chosen)}
                note={`Faixa legal: ${brl(privado.r.min)} a ${brl(privado.r.max)}.${privado.r.capped ? " O total foi limitado a 20% (art. 85, § 11)." : ""}`}
              />
            ) : (
              <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{privado.error}</div>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>
              Salário mínimo vigente (R$)
              <input className="input" inputMode="decimal" value={sm} onChange={(e) => setSm(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              Posição em cada faixa: {position}%
              <input type="range" min={0} max={100} step={5} value={position} onChange={(e) => setPosition(e.target.value)} />
            </label>
          </div>
          <div style={resultBox}>
            {publico.ok ? (
              <>
                <Big
                  label="Honorários estimados"
                  value={brl(publico.r.chosen)}
                  note={`Entre ${brl(publico.r.min)} (mínimo) e ${brl(publico.r.max)} (máximo). Valor equivale a ${publico.r.emSalarios.toLocaleString("pt-BR")} salários mínimos.`}
                />
                <table className="table" style={{ marginTop: 10, fontSize: 12.5 }}>
                  <thead>
                    <tr><th>Faixa</th><th>Valor na faixa</th><th>%</th><th>Mín.</th><th>Máx.</th></tr>
                  </thead>
                  <tbody>
                    {publico.r.faixas.map((f, i) => (
                      <tr key={i}>
                        <td>{["Até 200 SM", "200 a 2.000 SM", "2.000 a 20.000 SM", "20.000 a 100.000 SM", "Acima de 100.000 SM"][i]}</td>
                        <td>{brl(f.valor)}</td>
                        <td>{f.pctMin}–{f.pctMax}%</td>
                        <td>{brl(f.min)}</td>
                        <td>{brl(f.max)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{publico.error}</div>
            )}
          </div>
        </>
      )}
      <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
        Estimativa com base no CPC, art. 85. O percentual final depende do grau de zelo, do lugar da prestação, da natureza da causa
        e do trabalho realizado (§ 2º), e da decisão judicial.
      </p>
    </div>
  );
}

function Contratuais() {
  const [base, setBase] = useState("50.000,00");
  const [percent, setPercent] = useState("30");
  const [fixo, setFixo] = useState("0");
  const r = useMemo(() => attempt(() => honorariosContratuais({ base: money(base), percent: Number(percent), fixo: money(fixo) })), [base, percent, fixo]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="field">
        Proveito econômico esperado (R$)
        <input className="input" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <label className="field" style={{ flex: 1 }}>
          Percentual de êxito (%)
          <input className="input" type="number" min={0} max={100} step={0.5} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </label>
        <label className="field" style={{ flex: 1 }}>
          Valor fixo (R$)
          <input className="input" inputMode="decimal" value={fixo} onChange={(e) => setFixo(e.target.value)} />
        </label>
      </div>
      <div style={resultBox}>
        {r.ok ? (
          <Big label="Total contratual" value={brl(r.r.total)} note={`${brl(r.r.percentual)} de êxito + ${brl(r.r.fixo)} fixos.`} />
        ) : (
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{r.error}</div>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
        Consulte a tabela de honorários da OAB da sua seccional para os valores mínimos de referência.
      </p>
    </div>
  );
}

function Custas() {
  const [valor, setValor] = useState("20.000,00");
  const [percent, setPercent] = useState("1");
  const [minimo, setMinimo] = useState("");
  const [maximo, setMaximo] = useState("");
  const [taxas, setTaxas] = useState("0");
  const r = useMemo(
    () =>
      attempt(() =>
        custas({
          valorCausa: money(valor),
          percent: Number(percent),
          minimo: minimo.trim() ? money(minimo) : undefined,
          maximo: maximo.trim() ? money(maximo) : undefined,
          taxasFixas: money(taxas),
        }),
      ),
    [valor, percent, minimo, maximo, taxas],
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="field">
        Valor da causa (R$)
        <input className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="field" style={{ flex: 1, minWidth: 140 }}>
          Taxa judiciária (%)
          <input className="input" type="number" min={0} max={100} step={0.05} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 140 }}>
          Mínimo (R$)
          <input className="input" inputMode="decimal" placeholder="Sem mínimo" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 140 }}>
          Máximo (R$)
          <input className="input" inputMode="decimal" placeholder="Sem teto" value={maximo} onChange={(e) => setMaximo(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Outras taxas fixas (citação, diligências, mandato) (R$)
        <input className="input" inputMode="decimal" value={taxas} onChange={(e) => setTaxas(e.target.value)} />
      </label>
      <div style={resultBox}>
        {r.ok ? (
          <Big
            label="Custas estimadas"
            value={brl(r.r.total)}
            note={`Taxa calculada: ${brl(r.r.calculado)}${r.r.limitadoPor === "minimo" ? ", ajustada ao mínimo" : r.r.limitadoPor === "maximo" ? ", limitada ao teto" : ""}. Taxas fixas: ${brl(r.r.taxasFixas)}.`}
          />
        ) : (
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{r.error}</div>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
        Percentuais, mínimos e tetos mudam por tribunal e por ano. Use os valores do regimento de custas vigente do seu tribunal.
      </p>
    </div>
  );
}
