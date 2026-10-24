import { z } from "zod";

// Configurações administrativas persistidas em public.admin_settings (uma linha por chave).

const optInt = z.number().int().positive().nullable();
const optMoney = z.number().nonnegative().nullable();

export const FEATURE_KEYS = [
  "assistant",
  "petitions",
  "documents",
  "process_lookup",
  "legislation",
  "case_law",
  "agenda_files",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, [string, string]> = {
  assistant: ["Assistente jurídico", "Conversa e pesquisa de fundamentos"],
  petitions: ["Criação de petições", "Editor e geração de minutas"],
  documents: ["Análise de documentos", "Resumo e extração com referência ao trecho"],
  process_lookup: ["Consulta processual", "Depende de fornecedor autorizado"],
  legislation: ["Pesquisa legislativa", "Depende de fonte jurídica verificada"],
  case_law: ["Jurisprudência", "Depende de fonte jurídica verificada"],
  agenda_files: ["Agenda e arquivos", "Organização do advogado"],
};

const featuresSchema = z.object(
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean()])) as Record<FeatureKey, z.ZodBoolean>,
);

export const settingsSchemas = {
  ai_model: z.object({
    provider: z.literal("openai"),
    model: z.string().trim().max(100),
    temperature: z.number().min(0).max(1),
    max_output_tokens: optInt,
  }),
  ai_limits: z.object({
    tokens_user_day: optInt,
    tokens_user_month: optInt,
    cost_month_brl: optMoney,
    alert_pct: z.number().int().min(1).max(100),
  }),
  features: featuresSchema,
  plan: z.object({
    price_brl: optMoney,
    tokens_month: optInt,
    renewal: z.enum(["auto", "man"]),
    available: z.boolean(),
    mp_plan_id: z.string().nullable(),
    features: featuresSchema,
  }),
  trial: z.object({
    days: z.number().int().min(0).max(90),
    ai_requests: optInt,
    documents: optInt,
    petitions: optInt,
    max_tokens: optInt,
    on_expire: z.enum(["block", "view"]),
  }),
  legal: z.object({
    provider: z.enum(["", "oficial", "lic"]),
    contract: z.enum(["nc", "neg", "at"]),
    sources: z.object({
      legislation: z.boolean(),
      summaries: z.boolean(),
      case_law: z.boolean(),
      doctrine: z.boolean(),
      process_lookup: z.boolean(),
    }),
  }),
} as const;

export type SettingKey = keyof typeof settingsSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingsSchemas)[K]> };
export const SETTING_KEYS = Object.keys(settingsSchemas) as SettingKey[];

const allFeatures = (on: FeatureKey[]) =>
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, on.includes(k)])) as Record<FeatureKey, boolean>;

/** Mesmos valores semeados na migração. Usados quando a linha ainda não existe. */
export const DEFAULT_SETTINGS: Settings = {
  ai_model: { provider: "openai", model: "", temperature: 0.2, max_output_tokens: null },
  ai_limits: { tokens_user_day: null, tokens_user_month: null, cost_month_brl: null, alert_pct: 80 },
  features: allFeatures(["assistant", "petitions", "documents"]),
  plan: {
    price_brl: 44.9,
    tokens_month: null,
    renewal: "auto",
    available: false,
    mp_plan_id: null,
    features: allFeatures(["assistant", "petitions", "documents"]),
  },
  trial: { days: 3, ai_requests: null, documents: null, petitions: null, max_tokens: null, on_expire: "block" },
  legal: {
    provider: "",
    contract: "nc",
    sources: { legislation: false, summaries: false, case_law: false, doctrine: false, process_lookup: false },
  },
};

export function isSettingKey(key: string): key is SettingKey {
  return key in settingsSchemas;
}

export function parseSetting<K extends SettingKey>(key: K, value: unknown) {
  return settingsSchemas[key].safeParse(value) as z.ZodSafeParseResult<Settings[K]>;
}

/** Combina as linhas do banco com os padrões; linhas inválidas são ignoradas em favor do padrão. */
export function mergeSettings(rows: { key: string; value: unknown }[] | null | undefined): Settings {
  const out = structuredClone(DEFAULT_SETTINGS) as Record<SettingKey, unknown>;
  for (const row of rows ?? []) {
    if (!isSettingKey(row.key)) continue;
    const parsed = parseSetting(row.key, row.value);
    if (parsed.success) out[row.key] = parsed.data;
  }
  return out as Settings;
}

export type PublicSettings = {
  features: Settings["features"];
  plan: Pick<Settings["plan"], "price_brl" | "available" | "renewal">;
  trial: Settings["trial"];
};
