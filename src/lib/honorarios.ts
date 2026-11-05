// Calculadoras de honorários e custas. Funções puras, testadas em tests/honorarios.test.ts.
//
// - CPC art. 85, § 2º: honorários de sucumbência entre 10% e 20% do valor da condenação,
//   do proveito econômico ou, não sendo possível mensurá-lo, do valor atualizado da causa.
// - CPC art. 85, §§ 3º e 5º: contra a Fazenda Pública, faixas em salários mínimos aplicadas
//   de forma escalonada (cada faixa incide só sobre a parte do valor que está dentro dela).
// - CPC art. 85, § 11: honorários recursais, somados aos fixados, sem ultrapassar 20% (§ 2º).
// Custas variam por tribunal; a calculadora usa o percentual, o mínimo e o máximo informados.

export const SALARIO_MINIMO_2026 = 1621;

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function assertMoney(v: number, name: string) {
  if (!Number.isFinite(v) || v < 0) throw new Error(`${name} inválido.`);
}

export type HonorariosPrivadosInput = { base: number; percent: number; recursalPercent?: number };
export type HonorariosPrivadosResult = { min: number; max: number; chosen: number; percentApplied: number; capped: boolean };

/** Honorários de sucumbência entre particulares (art. 85, §§ 2º e 11). */
export function honorariosPrivados(input: HonorariosPrivadosInput): HonorariosPrivadosResult {
  assertMoney(input.base, "Valor-base");
  if (input.percent < 10 || input.percent > 20) throw new Error("O percentual deve ficar entre 10% e 20% (CPC art. 85, § 2º).");
  const recursal = input.recursalPercent ?? 0;
  if (recursal < 0) throw new Error("Percentual recursal inválido.");
  const total = input.percent + recursal;
  const percentApplied = Math.min(total, 20);
  return {
    min: round2(input.base * 0.1),
    max: round2(input.base * 0.2),
    chosen: round2((input.base * percentApplied) / 100),
    percentApplied,
    capped: total > 20,
  };
}

/** Faixas do art. 85, § 3º, em salários mínimos: [limite superior, % mínimo, % máximo]. */
export const FAIXAS_FAZENDA: [number, number, number][] = [
  [200, 10, 20],
  [2_000, 8, 10],
  [20_000, 5, 8],
  [100_000, 3, 5],
  [Infinity, 1, 3],
];

export type FaixaAplicada = { de: number; ate: number; valor: number; pctMin: number; pctMax: number; min: number; max: number };
export type HonorariosFazendaResult = { min: number; max: number; chosen: number; faixas: FaixaAplicada[]; emSalarios: number };

/**
 * Honorários contra a Fazenda Pública (art. 85, §§ 3º e 5º), escalonados por faixa.
 * `position` vai de 0 (mínimo de cada faixa) a 1 (máximo de cada faixa).
 */
export function honorariosFazenda(input: { base: number; salarioMinimo?: number; position?: number }): HonorariosFazendaResult {
  assertMoney(input.base, "Valor-base");
  const sm = input.salarioMinimo ?? SALARIO_MINIMO_2026;
  if (!Number.isFinite(sm) || sm <= 0) throw new Error("Salário mínimo inválido.");
  const pos = Math.min(Math.max(input.position ?? 0, 0), 1);

  const faixas: FaixaAplicada[] = [];
  let anterior = 0;
  let min = 0;
  let max = 0;
  let chosen = 0;
  for (const [limite, pctMin, pctMax] of FAIXAS_FAZENDA) {
    const de = anterior * sm;
    const ate = limite * sm;
    if (input.base <= de) break;
    const valor = Math.min(input.base, ate) - de;
    const fMin = (valor * pctMin) / 100;
    const fMax = (valor * pctMax) / 100;
    faixas.push({ de: round2(de), ate: round2(ate), valor: round2(valor), pctMin, pctMax, min: round2(fMin), max: round2(fMax) });
    min += fMin;
    max += fMax;
    chosen += fMin + (fMax - fMin) * pos;
    anterior = limite;
  }
  return { min: round2(min), max: round2(max), chosen: round2(chosen), faixas, emSalarios: round2(input.base / sm) };
}

export type HonorariosContratuaisResult = { percentual: number; fixo: number; total: number };

/** Honorários contratuais: percentual sobre o proveito mais um valor fixo. */
export function honorariosContratuais(input: { base: number; percent: number; fixo?: number }): HonorariosContratuaisResult {
  assertMoney(input.base, "Valor-base");
  if (!Number.isFinite(input.percent) || input.percent < 0 || input.percent > 100) throw new Error("Percentual inválido.");
  const fixo = input.fixo ?? 0;
  assertMoney(fixo, "Valor fixo");
  const percentual = round2((input.base * input.percent) / 100);
  return { percentual, fixo: round2(fixo), total: round2(percentual + fixo) };
}

export type CustasInput = { valorCausa: number; percent: number; minimo?: number; maximo?: number; taxasFixas?: number };
export type CustasResult = { calculado: number; aplicado: number; taxasFixas: number; total: number; limitadoPor: "minimo" | "maximo" | null };

/** Estimativa de custas iniciais pela regra do tribunal informada pelo usuário. */
export function custas(input: CustasInput): CustasResult {
  assertMoney(input.valorCausa, "Valor da causa");
  if (!Number.isFinite(input.percent) || input.percent < 0 || input.percent > 100) throw new Error("Percentual de custas inválido.");
  const minimo = input.minimo ?? 0;
  const maximo = input.maximo ?? Infinity;
  assertMoney(minimo, "Valor mínimo");
  if (maximo !== Infinity) assertMoney(maximo, "Valor máximo");
  if (maximo < minimo) throw new Error("O valor máximo não pode ser menor que o mínimo.");
  const taxasFixas = input.taxasFixas ?? 0;
  assertMoney(taxasFixas, "Taxas fixas");

  const calculado = (input.valorCausa * input.percent) / 100;
  let aplicado = calculado;
  let limitadoPor: CustasResult["limitadoPor"] = null;
  if (aplicado < minimo) {
    aplicado = minimo;
    limitadoPor = "minimo";
  } else if (aplicado > maximo) {
    aplicado = maximo;
    limitadoPor = "maximo";
  }
  return { calculado: round2(calculado), aplicado: round2(aplicado), taxasFixas: round2(taxasFixas), total: round2(aplicado + taxasFixas), limitadoPor };
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
