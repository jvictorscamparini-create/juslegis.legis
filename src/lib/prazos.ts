// Cálculo de prazos processuais. Funções puras (sem I/O), testadas em tests/prazos.test.ts.
//
// Regras aplicadas:
// - CPC art. 219: prazos em dias contam somente dias úteis.
// - CPC art. 224: exclui o dia do começo e inclui o do vencimento; o início e o fim
//   são protraídos para o primeiro dia útil seguinte.
// - CPC art. 220: suspensão dos prazos entre 20 de dezembro e 20 de janeiro, inclusive.
// - CPC arts. 180, 183, 186 e 229: prazo em dobro (Ministério Público, Fazenda, Defensoria, litisconsortes).
// - Lei 11.419/2006 art. 4º, §§ 3º e 4º: no DJe, considera-se publicado no primeiro dia útil
//   seguinte à disponibilização, e o prazo começa no primeiro dia útil seguinte à publicação.
// - Feriados nacionais (Leis 662/1949, 6.802/1980 e 14.759/2023) e dias sem expediente forense
//   (Carnaval, Sexta-feira Santa, Corpus Christi). Justiça Federal: Lei 5.010/1966, art. 62.
// Feriados estaduais e municipais e suspensões de cada tribunal entram como datas extras.

export type Counting = "business" | "calendar";
export type StartMode = "intimacao" | "dje";
export type Court = "estadual" | "federal";

export type DeadlineInput = {
  /** Data da intimação/publicação, ou da disponibilização no DJe, em AAAA-MM-DD. */
  startDate: string;
  days: number;
  counting: Counting;
  startMode?: StartMode;
  doubled?: boolean;
  court?: Court;
  /** Feriados locais e suspensões do tribunal, em AAAA-MM-DD. */
  extraHolidays?: string[];
};

export type SkippedDay = { date: string; reason: string };

export type DeadlineResult = {
  dueDate: string;
  /** Primeiro dia contado. */
  firstDay: string;
  /** Data considerada de publicação (igual à de início, salvo no modo DJe). */
  publicationDate: string;
  effectiveDays: number;
  /** Dias não contados ou que adiaram o vencimento, com o motivo. */
  skipped: SkippedDay[];
};

const DAY_MS = 86_400_000;

/** "AAAA-MM-DD" → Date em UTC ao meio-dia (evita erros de fuso e horário de verão). */
export function parseDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error("Data inválida. Use AAAA-MM-DD.");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (d.getUTCMonth() !== Number(m[2]) - 1) throw new Error("Data inválida.");
  return d;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** Feriados e dias sem expediente forense de um ano, por data. */
export function holidaysOf(year: number, court: Court = "estadual"): Map<string, string> {
  const map = new Map<string, string>();
  const fixed: [number, number, string][] = [
    [1, 1, "Confraternização Universal"],
    [4, 21, "Tiradentes"],
    [5, 1, "Dia do Trabalho"],
    [9, 7, "Independência do Brasil"],
    [10, 12, "Nossa Senhora Aparecida"],
    [11, 2, "Finados"],
    [11, 15, "Proclamação da República"],
    [11, 20, "Dia Nacional de Zumbi e da Consciência Negra"],
    [12, 25, "Natal"],
  ];
  if (court === "federal") {
    fixed.push([8, 11, "Dia da Justiça Federal (Lei 5.010/1966)"], [11, 1, "Dia de Todos os Santos (Lei 5.010/1966)"], [12, 8, "Dia da Justiça (Lei 5.010/1966)"]);
  }
  for (const [m, d, name] of fixed) map.set(formatDate(new Date(Date.UTC(year, m - 1, d, 12))), name);

  const e = easter(year);
  const movable: [number, string][] = [
    [-48, "Carnaval (segunda-feira)"],
    [-47, "Carnaval (terça-feira)"],
    [-2, "Sexta-feira Santa"],
    [60, "Corpus Christi"],
  ];
  if (court === "federal") movable.push([-4, "Quarta-feira Santa (Lei 5.010/1966)"], [-3, "Quinta-feira Santa (Lei 5.010/1966)"]);
  for (const [offset, name] of movable) map.set(formatDate(addDays(e, offset)), name);
  return map;
}

/** Recesso forense do CPC art. 220: 20/12 a 20/01, inclusive. */
export function inRecess(d: Date): boolean {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return (m === 12 && day >= 20) || (m === 1 && day <= 20);
}

type Calendar = { reasonFor: (d: Date, withRecess: boolean) => string | null };

function makeCalendar(court: Court, extra: string[]): Calendar {
  const byYear = new Map<number, Map<string, string>>();
  const extraSet = new Set(extra);
  return {
    reasonFor(d, withRecess) {
      const wd = d.getUTCDay();
      if (wd === 0) return "Domingo";
      if (wd === 6) return "Sábado";
      const key = formatDate(d);
      const y = d.getUTCFullYear();
      if (!byYear.has(y)) byYear.set(y, holidaysOf(y, court));
      const holiday = byYear.get(y)!.get(key);
      if (holiday) return holiday;
      if (extraSet.has(key)) return "Feriado local ou suspensão informada";
      if (withRecess && inRecess(d)) return "Recesso forense (CPC art. 220)";
      return null;
    },
  };
}

const MAX_DAYS = 3650;

export function calculateDeadline(input: DeadlineInput): DeadlineResult {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_DAYS) {
    throw new Error(`O prazo deve ter entre 1 e ${MAX_DAYS} dias.`);
  }
  const extras = (input.extraHolidays ?? []).map((v) => formatDate(parseDate(v)));
  const cal = makeCalendar(input.court ?? "estadual", extras);
  const business = input.counting === "business";
  const skipped: SkippedDay[] = [];
  const effectiveDays = input.doubled ? input.days * 2 : input.days;

  /** Próximo dia útil estritamente depois de `d`, registrando os pulados. */
  const nextBusinessDay = (d: Date, withRecess: boolean) => {
    let cur = addDays(d, 1);
    for (let guard = 0; guard < 400; guard++) {
      const reason = cal.reasonFor(cur, withRecess);
      if (!reason) return cur;
      skipped.push({ date: formatDate(cur), reason });
      cur = addDays(cur, 1);
    }
    throw new Error("Não foi possível encontrar um dia útil.");
  };

  let publication = parseDate(input.startDate);
  if (input.startMode === "dje") publication = nextBusinessDay(publication, business);

  if (business) {
    // O primeiro dia contado é o primeiro dia útil após a publicação/intimação (art. 224, § 3º).
    let cur = nextBusinessDay(publication, true);
    const firstDay = cur;
    for (let counted = 1; counted < effectiveDays; counted++) cur = nextBusinessDay(cur, true);
    return { dueDate: formatDate(cur), firstDay: formatDate(firstDay), publicationDate: formatDate(publication), effectiveDays, skipped: dedupe(skipped) };
  }

  // Dias corridos: conta todos os dias; se o vencimento cair em dia sem expediente, prorroga.
  const firstDay = addDays(publication, 1);
  let due = addDays(publication, effectiveDays);
  const reason = cal.reasonFor(due, false);
  if (reason) {
    skipped.push({ date: formatDate(due), reason });
    due = nextBusinessDay(due, false);
  }
  return { dueDate: formatDate(due), firstDay: formatDate(firstDay), publicationDate: formatDate(publication), effectiveDays, skipped: dedupe(skipped) };
}

function dedupe(list: SkippedDay[]): SkippedDay[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.date) ? false : (seen.add(s.date), true)));
}

/** Dias de calendário entre hoje e o vencimento (negativo = vencido). */
export function daysUntil(dueDate: string, today: Date = new Date()): number {
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.round((parseDate(dueDate).getTime() - t) / DAY_MS);
}

export type Urgency = "overdue" | "today" | "soon" | "later";

export function urgencyOf(dueDate: string, today?: Date): Urgency {
  const n = daysUntil(dueDate, today);
  if (n < 0) return "overdue";
  if (n === 0) return "today";
  if (n <= 3) return "soon";
  return "later";
}

export function formatBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
