import { z } from 'npm:zod@4.4.3'

// Cópia dos esquemas de src/lib/settings.ts (o app Next.js), para a Edge Function validar
// exatamente as mesmas regras do painel /admin. As Edge Functions não importam arquivos de
// fora de supabase/functions na implantação, por isso a cópia.
// settings_parity_test.ts compara esta cópia com o original: se mudar um, mude o outro.

const optInt = z.number().int().positive().nullable()
const optMoney = z.number().nonnegative().nullable()

export const FEATURE_KEYS = [
  'assistant',
  'petitions',
  'documents',
  'process_lookup',
  'legislation',
  'case_law',
  'agenda_files',
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

const featuresSchema = z.object(
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean()])) as Record<FeatureKey, z.ZodBoolean>
)

export const settingsSchemas = {
  ai_model: z.object({
    provider: z.literal('openai'),
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
    renewal: z.enum(['auto', 'man']),
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
    on_expire: z.enum(['block', 'view']),
  }),
  legal: z.object({
    provider: z.enum(['', 'oficial', 'lic']),
    contract: z.enum(['nc', 'neg', 'at']),
    sources: z.object({
      legislation: z.boolean(),
      summaries: z.boolean(),
      case_law: z.boolean(),
      doctrine: z.boolean(),
      process_lookup: z.boolean(),
    }),
  }),
} as const

export type SettingKey = keyof typeof settingsSchemas
export type Settings = { [K in SettingKey]: z.infer<(typeof settingsSchemas)[K]> }
export const SETTING_KEYS = Object.keys(settingsSchemas) as SettingKey[]

const allFeatures = (on: FeatureKey[]) =>
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, on.includes(k)])) as Record<FeatureKey, boolean>

/** Mesmos valores semeados na migração. Usados quando a linha ainda não existe. */
export const DEFAULT_SETTINGS: Settings = {
  ai_model: { provider: 'openai', model: '', temperature: 0.2, max_output_tokens: null },
  ai_limits: { tokens_user_day: null, tokens_user_month: null, cost_month_brl: null, alert_pct: 80 },
  features: allFeatures(['assistant', 'petitions', 'documents']),
  plan: {
    price_brl: 44.9,
    tokens_month: null,
    renewal: 'auto',
    available: false,
    mp_plan_id: null,
    features: allFeatures(['assistant', 'petitions', 'documents']),
  },
  trial: { days: 3, ai_requests: null, documents: null, petitions: null, max_tokens: null, on_expire: 'block' },
  legal: {
    provider: '',
    contract: 'nc',
    sources: { legislation: false, summaries: false, case_law: false, doctrine: false, process_lookup: false },
  },
}

export function isSettingKey(key: string): key is SettingKey {
  return key in settingsSchemas
}

export type ParsedSetting<K extends SettingKey> =
  | { success: true; data: Settings[K] }
  | { success: false; error: z.ZodError }

export function parseSetting<K extends SettingKey>(key: K, value: unknown): ParsedSetting<K> {
  return settingsSchemas[key].safeParse(value) as ParsedSetting<K>
}

/** Combina as linhas do banco com os padrões; linhas inválidas são ignoradas em favor do padrão. */
export function mergeSettings(rows: { key: string; value: unknown }[] | null | undefined): Settings {
  const out = structuredClone(DEFAULT_SETTINGS) as Record<SettingKey, unknown>
  for (const row of rows ?? []) {
    if (!isSettingKey(row.key)) continue
    const parsed = parseSetting(row.key, row.value)
    if (parsed.success) out[row.key] = parsed.data
  }
  return out as Settings
}
