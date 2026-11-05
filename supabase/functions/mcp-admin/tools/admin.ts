import type { CallToolResult, McpServer } from 'npm:@modelcontextprotocol/server@2.0.0'
import { z } from 'npm:zod@4.4.3'

import { errorResult, jsonResult, runtimeErrorResult } from '../../mcp/tools/result.ts'
import type { ToolContext } from '../../mcp/tools/types.ts'
import { DEFAULT_SETTINGS, mergeSettings, parseSetting, SETTING_KEYS, type SettingKey } from './settings.ts'

// Ferramentas do Administrador Geral. Espelham as rotas /api/admin/* do site:
// mesmas validações (esquemas de settings.ts), mesma regra do mp_plan_id e o mesmo
// registro em admin_audit_log. Nada aqui usa service role: o cliente é o do próprio
// usuário e o banco só deixa is_admin() ler e gravar estas tabelas (RLS).
//
// Fora do escopo de propósito: bloquear/reativar contas (exige service role, fica no painel
// /admin/usuarios), credenciais de integrações (cifradas, ficam em /admin/apis) e cobranças.

export const ADMIN_DENIED =
  'Acesso restrito ao Administrador Geral. Entre com uma conta de papel admin ativa na JusLegis.'

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

type Json = Record<string, unknown>

function isPlainObject(value: unknown): value is Json {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Caminhos de `changes` que não existem na configuração (erro de digitação, campo inventado, __proto__). */
export function unknownPaths(base: unknown, changes: Json, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(changes)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (!isPlainObject(base) || !Object.hasOwn(base, k)) {
      out.push(path)
      continue
    }
    if (isPlainObject(v) && isPlainObject(base[k])) out.push(...unknownPaths(base[k], v, path))
  }
  return out
}

/** Aplica só os campos informados sobre o valor atual; objetos aninhados são mesclados. */
export function deepMerge(base: Json, changes: Json): Json {
  const out: Json = { ...base }
  for (const [k, v] of Object.entries(changes)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k] as Json, v) : v
  }
  return out
}

/** Campos (folhas) cujo valor mudou entre antes e depois. */
export function changedPaths(before: unknown, after: unknown, prefix = ''): string[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].flatMap((k) => changedPaths(before[k], after[k], prefix ? `${prefix}.${k}` : k))
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [prefix]
}

/** Escapa curingas do LIKE para a busca por e-mail ser literal. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

const SETTINGS_GUIDE = [
  'ai_model {provider:"openai", model, temperature 0-1, max_output_tokens}',
  'ai_limits {tokens_user_day, tokens_user_month, cost_month_brl, alert_pct 1-100}',
  'features {assistant, petitions, documents, process_lookup, legislation, case_law, agenda_files: true/false}',
  'plan {price_brl, tokens_month, renewal "auto"|"man", available, features{...}} (mp_plan_id só pela sincronização com o Mercado Pago)',
  'trial {days 0-90, ai_requests, documents, petitions, max_tokens, on_expire "block"|"view"}',
  'legal {provider ""|"oficial"|"lic", contract "nc"|"neg"|"at", sources{legislation, summaries, case_law, doctrine, process_lookup}}',
].join('; ')

const settingKeySchema = z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]])

export function registerAdminTools(server: McpServer, { supabase, userClaims }: ToolContext): void {
  const actorId = userClaims.id

  /** Confere no banco, a cada chamada, se quem chama é admin ativo. null = liberado. */
  async function denyUnlessAdmin(): Promise<CallToolResult | null> {
    const { data, error } = await supabase.from('profiles').select('role, status').eq('id', actorId).maybeSingle()
    if (error) return runtimeErrorResult(error)
    if (!data || data.role !== 'admin' || data.status !== 'active') return errorResult(ADMIN_DENIED)
    return null
  }

  function adminOnly<A>(handler: (args: A) => Promise<CallToolResult>) {
    return async (args: A): Promise<CallToolResult> => {
      const denied = await denyUnlessAdmin()
      if (denied) return denied
      try {
        return await handler(args)
      } catch (error) {
        return runtimeErrorResult(error)
      }
    }
  }

  async function audit(entry: { action: string; target: string; before?: unknown; after?: unknown }) {
    const { error } = await supabase.from('admin_audit_log').insert({
      actor_id: actorId,
      action: entry.action,
      target: entry.target,
      before: entry.before ?? null,
      after: entry.after ?? null,
    })
    return error ? 'A alteração foi feita, mas o registro no log de auditoria falhou.' : null
  }

  // ───────────────────────── Configurações ─────────────────────────

  server.registerTool(
    'admin_get_settings',
    {
      description:
        'Lê as configurações do site (modelo e limites da IA, módulos ativos, plano e preço, teste grátis, fontes jurídicas). ' +
        'Chaves sem valor salvo aparecem com o padrão. Informe "key" para ler só uma.',
      inputSchema: z.object({ key: settingKeySchema.optional().describe('Chave de configuração (opcional).') }),
      annotations: READ_ONLY,
    },
    adminOnly(async ({ key }: { key?: SettingKey }) => {
      const { data, error } = await supabase.from('admin_settings').select('key, value, updated_at')
      if (error) return runtimeErrorResult(error)
      const rows = (data ?? []) as { key: string; value: unknown; updated_at: string }[]
      const settings = mergeSettings(rows)
      const updatedAt = Object.fromEntries(rows.map((r) => [r.key, r.updated_at]))
      if (key) return jsonResult({ key, value: settings[key], updated_at: updatedAt[key] ?? null })
      return jsonResult({ settings, updated_at: updatedAt })
    })
  )

  server.registerTool(
    'admin_update_setting',
    {
      description:
        'Altera uma configuração do site. Informe só os campos que mudam em "changes"; o restante é mantido. ' +
        'Valida com as mesmas regras do painel /admin e registra no log de auditoria. ' +
        'Use dry_run=true para ver o antes e o depois sem gravar e confirme com o administrador antes de gravar. ' +
        `Campos por chave: ${SETTINGS_GUIDE}.`,
      inputSchema: z.object({
        key: settingKeySchema.describe('Chave de configuração a alterar.'),
        changes: z
          .record(z.string(), z.unknown())
          .refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo.')
          .describe('Somente os campos que mudam. Ex.: {"days": 7} para trial.'),
        dry_run: z.boolean().default(false).describe('true = só mostra o resultado, sem gravar.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    adminOnly(async ({ key, changes, dry_run }: { key: SettingKey; changes: Json; dry_run: boolean }) => {
      if (key === 'plan' && Object.hasOwn(changes, 'mp_plan_id')) {
        return errorResult(
          'mp_plan_id não pode ser alterado aqui: ele só muda pela sincronização do plano no painel /admin/mercado-pago.'
        )
      }

      const { data: current, error: readError } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle()
      if (readError) return runtimeErrorResult(readError)

      const stored = parseSetting(key, current?.value)
      const before = (stored.success ? stored.data : structuredClone(DEFAULT_SETTINGS[key])) as Json

      const unknown = unknownPaths(before, changes)
      if (unknown.length) {
        return errorResult(
          `Campos desconhecidos em "${key}": ${unknown.join(', ')}. Campos válidos: ${Object.keys(before).join(', ')}.`
        )
      }

      const merged = deepMerge(before, changes)
      if (key === 'plan') merged.mp_plan_id = (before as { mp_plan_id?: string | null }).mp_plan_id ?? null

      const parsed = parseSetting(key, merged)
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.') || key}: ${i.message}`)
        return errorResult(`Valores inválidos para "${key}": ${issues.join('; ')}`)
      }
      const after = parsed.data
      const changed = changedPaths(before, after)

      if (!changed.length) {
        return jsonResult({ key, dry_run, changed: [], message: 'Nenhuma alteração: os valores informados já são os atuais.' })
      }
      if (dry_run) return jsonResult({ key, dry_run: true, changed, before, after })

      const { error: writeError } = await supabase
        .from('admin_settings')
        .upsert({ key, value: after, updated_at: new Date().toISOString(), updated_by: actorId })
      if (writeError) return runtimeErrorResult(writeError)

      const warning = await audit({ action: 'settings.update', target: key, before: current?.value ?? null, after })
      return jsonResult({ key, dry_run: false, changed, before, after, ...(warning ? { warning } : {}) })
    })
  )

  // ───────────────────────── Prompts da IA ─────────────────────────

  server.registerTool(
    'admin_list_prompts',
    {
      description:
        'Lista as versões do prompt de sistema da IA (nome, versão, se está ativa, data e início do texto). Use admin_get_prompt para ler uma inteira.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20).describe('Máximo de versões (1 a 50).'),
      }),
      annotations: READ_ONLY,
    },
    adminOnly(async ({ limit }: { limit: number }) => {
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('id, name, version, active, created_at, content')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return runtimeErrorResult(error)
      const prompts = ((data ?? []) as { content: string; [k: string]: unknown }[]).map(({ content, ...rest }) => ({
        ...rest,
        chars: String(content ?? '').length,
        preview: String(content ?? '').slice(0, 200),
      }))
      return jsonResult({ prompts })
    })
  )

  server.registerTool(
    'admin_get_prompt',
    {
      description: 'Devolve o texto completo de uma versão do prompt de sistema da IA.',
      inputSchema: z.object({ id: z.uuid().describe('Identificador da versão do prompt.') }),
      annotations: READ_ONLY,
    },
    adminOnly(async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('id, name, version, active, created_at, content')
        .eq('id', id)
        .maybeSingle()
      if (error) return runtimeErrorResult(error)
      if (!data) return errorResult('Prompt não encontrado.')
      return jsonResult(data)
    })
  )

  server.registerTool(
    'admin_create_prompt',
    {
      description:
        'Cria uma nova versão do prompt de sistema da IA (as anteriores ficam no histórico). ' +
        'Com active=true ela passa a ser a única ativa e é usada imediatamente em todas as respostas da IA do site.',
      inputSchema: z.object({
        name: z.string().trim().min(1).max(120).describe('Nome do prompt (a versão é numerada por nome).'),
        content: z.string().trim().min(1).max(20_000).describe('Texto do prompt (até 20 mil caracteres).'),
        active: z.boolean().default(false).describe('true = ativar esta versão agora.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    adminOnly(async ({ name, content, active }: { name: string; content: string; active: boolean }) => {
      const { data: last, error: lastError } = await supabase
        .from('ai_prompts')
        .select('version')
        .eq('name', name)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastError) return runtimeErrorResult(lastError)
      const version = ((last as { version?: number } | null)?.version ?? 0) + 1

      // Grava inativa primeiro: se algo falhar, o prompt ativo atual continua valendo.
      const { data: created, error: insertError } = await supabase
        .from('ai_prompts')
        .insert({ name, content, version, active: false, created_by: actorId })
        .select('id, name, version, active, created_at')
        .single()
      if (insertError) return runtimeErrorResult(insertError)
      const prompt = created as { id: string; active: boolean }

      if (active) {
        const activation = await activatePrompt(prompt.id)
        if (activation) return activation
        prompt.active = true
      }

      const warning = await audit({ action: 'prompt.create', target: `${name} v${version}`, after: { name, version, active } })
      return jsonResult({ prompt, ...(warning ? { warning } : {}) })
    })
  )

  /** Deixa somente `id` ativo. Devolve um erro de ferramenta ou null em caso de sucesso. */
  async function activatePrompt(id: string): Promise<CallToolResult | null> {
    const { error: offError } = await supabase.from('ai_prompts').update({ active: false }).eq('active', true).neq('id', id)
    if (offError) return runtimeErrorResult(offError)
    const { error: onError } = await supabase.from('ai_prompts').update({ active: true }).eq('id', id)
    if (onError) return runtimeErrorResult(onError)
    return null
  }

  server.registerTool(
    'admin_activate_prompt',
    {
      description:
        'Ativa uma versão existente do prompt de sistema (por exemplo, para voltar a uma versão anterior). ' +
        'As demais ficam inativas e a IA do site passa a usar esta imediatamente.',
      inputSchema: z.object({ id: z.uuid().describe('Identificador da versão a ativar.') }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    adminOnly(async ({ id }: { id: string }) => {
      const { data, error } = await supabase.from('ai_prompts').select('id, name, version, active').eq('id', id).maybeSingle()
      if (error) return runtimeErrorResult(error)
      if (!data) return errorResult('Prompt não encontrado.')
      const prompt = data as { id: string; name: string; version: number; active: boolean }
      if (prompt.active) return jsonResult({ prompt, message: 'Esta versão já é a ativa.' })

      const activation = await activatePrompt(id)
      if (activation) return activation
      const warning = await audit({
        action: 'prompt.activate',
        target: `${prompt.name} v${prompt.version}`,
        after: { id, name: prompt.name, version: prompt.version },
      })
      return jsonResult({ prompt: { ...prompt, active: true }, ...(warning ? { warning } : {}) })
    })
  )

  // ───────────────────────── Usuários e auditoria (leitura) ─────────────────────────

  server.registerTool(
    'admin_list_users',
    {
      description:
        'Lista contas da JusLegis (e-mail, nome, papel, situação, data de criação), das mais novas para as mais antigas. ' +
        'Somente leitura: bloquear ou reativar contas continua no painel /admin/usuarios.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(50).describe('Máximo de contas (1 a 100).'),
        status: z.enum(['active', 'blocked']).optional().describe('Filtrar pela situação.'),
        email_contains: z.string().trim().min(1).max(100).optional().describe('Trecho do e-mail para buscar.'),
      }),
      annotations: READ_ONLY,
    },
    adminOnly(async ({ limit, status, email_contains }: { limit: number; status?: string; email_contains?: string }) => {
      let query = supabase.from('profiles').select('id, email, full_name, role, status, created_at')
      if (status) query = query.eq('status', status)
      if (email_contains) query = query.ilike('email', `%${escapeLike(email_contains)}%`)
      const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
      if (error) return runtimeErrorResult(error)
      return jsonResult({ users: data ?? [] })
    })
  )

  server.registerTool(
    'admin_recent_audit_log',
    {
      description:
        'Mostra as alterações administrativas mais recentes (quem, o quê, quando, antes e depois). ' +
        'Para credenciais só aparecem ação e alvo, nunca valores.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(30).describe('Máximo de registros (1 a 100).'),
      }),
      annotations: READ_ONLY,
    },
    adminOnly(async ({ limit }: { limit: number }) => {
      const { data, error } = await supabase
        .from('admin_audit_log')
        .select('id, actor_id, action, target, before, after, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return runtimeErrorResult(error)
      const entries = ((data ?? []) as { action: string; before: unknown; after: unknown }[]).map((e) =>
        e.action.startsWith('secret.') ? { ...e, before: null, after: null } : e
      )
      return jsonResult({ entries })
    })
  )
}
