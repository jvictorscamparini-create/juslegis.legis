// Garante que a cópia dos esquemas usada pela Edge Function (./settings.ts) é idêntica,
// em comportamento, à do app Next.js (src/lib/settings.ts), que valida o painel /admin.
// Só roda nos testes: na implantação a função usa apenas a cópia local.
import * as app from '../../../../src/lib/settings.ts'
import * as fn from './settings.ts'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`Falhou: ${msg}`)
}

Deno.test('mesmas chaves, módulos e padrões que o app', () => {
  assert(JSON.stringify(fn.SETTING_KEYS) === JSON.stringify(app.SETTING_KEYS), 'chaves de configuração diferentes')
  assert(JSON.stringify(fn.FEATURE_KEYS) === JSON.stringify(app.FEATURE_KEYS), 'módulos diferentes')
  assert(JSON.stringify(fn.DEFAULT_SETTINGS) === JSON.stringify(app.DEFAULT_SETTINGS), 'valores padrão diferentes')
})

const d = fn.DEFAULT_SETTINGS
const SAMPLES: Array<[fn.SettingKey, unknown]> = [
  ['ai_model', d.ai_model],
  ['ai_model', { ...d.ai_model, provider: 'anthropic' }],
  ['ai_model', { ...d.ai_model, temperature: 1.5 }],
  ['ai_model', { ...d.ai_model, model: 'x'.repeat(101) }],
  ['ai_model', { ...d.ai_model, max_output_tokens: 0 }],
  ['ai_limits', d.ai_limits],
  ['ai_limits', { ...d.ai_limits, alert_pct: 0 }],
  ['ai_limits', { ...d.ai_limits, cost_month_brl: -1 }],
  ['features', d.features],
  ['features', { ...d.features, assistant: 'sim' }],
  ['plan', d.plan],
  ['plan', { ...d.plan, renewal: 'anual' }],
  ['plan', { ...d.plan, price_brl: -5 }],
  ['plan', { ...d.plan, mp_plan_id: 'MP-1' }],
  ['trial', d.trial],
  ['trial', { ...d.trial, days: 91 }],
  ['trial', { ...d.trial, days: 2.5 }],
  ['trial', { ...d.trial, on_expire: 'apagar' }],
  ['legal', d.legal],
  ['legal', { ...d.legal, provider: 'outro' }],
  ['legal', { ...d.legal, sources: { ...d.legal.sources, doctrine: 1 } }],
]

Deno.test('mesmas regras de validação que o app', () => {
  for (const [key, value] of SAMPLES) {
    const a = app.parseSetting(key, value)
    const b = fn.parseSetting(key, value)
    assert(a.success === b.success, `${key}: app=${a.success} função=${b.success} para ${JSON.stringify(value)}`)
    if (a.success && b.success) assert(JSON.stringify(a.data) === JSON.stringify(b.data), `${key}: dados normalizados diferentes`)
  }
})
