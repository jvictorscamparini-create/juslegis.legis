import { registerAdminTools } from './index.ts'
import { ADMIN_DENIED, changedPaths, deepMerge, escapeLike, unknownPaths } from './admin.ts'
import type { ToolContext } from './index.ts'

// Testes unitários do MCP administrativo com cliente Supabase simulado. Comprovam que:
// quem não é admin ativo não lê nem grava nada; as alterações passam pelas mesmas
// validações do painel; o mp_plan_id é preservado; e toda escrita gera log de auditoria.

type Op = {
  table: string
  kind: 'select' | 'insert' | 'update' | 'upsert'
  payload?: unknown
  filters: Array<[string, string, unknown]>
  selected?: string
  limit?: number
}

type Responder = (op: Op) => { data: unknown; error: unknown }

function fakeSupabase(respond: Responder, ops: Op[]) {
  return {
    from(table: string) {
      const op: Op = { table, kind: 'select', filters: [] }
      ops.push(op)
      const run = () => Promise.resolve(respond(op))
      const builder: Record<string, unknown> = {
        select(cols: string) {
          op.selected = cols
          return builder
        },
        insert(payload: unknown) {
          op.kind = 'insert'
          op.payload = payload
          return builder
        },
        update(payload: unknown) {
          op.kind = 'update'
          op.payload = payload
          return builder
        },
        upsert(payload: unknown) {
          op.kind = 'upsert'
          op.payload = payload
          return builder
        },
        eq(col: string, val: unknown) {
          op.filters.push(['eq', col, val])
          return builder
        },
        neq(col: string, val: unknown) {
          op.filters.push(['neq', col, val])
          return builder
        },
        ilike(col: string, val: unknown) {
          op.filters.push(['ilike', col, val])
          return builder
        },
        order() {
          return builder
        },
        limit(n: number) {
          op.limit = n
          return builder
        },
        maybeSingle: run,
        single: run,
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return run().then(resolve, reject)
        },
      }
      return builder
    },
  }
}

// deno-lint-ignore no-explicit-any
type Handler = (args: any) => Promise<any>
type Registered = {
  config: { inputSchema?: { safeParse: (v: unknown) => { success: boolean } }; annotations?: Record<string, boolean> }
  handler: Handler
}

const ADMIN = '11111111-1111-4111-8111-111111111111'
const PROMPT_ID = '33333333-3333-4333-8333-333333333333'

type Profile = { role: string; status: string } | null

function setup(opts: { profile?: Profile; tables?: Record<string, unknown> } = {}) {
  const profile = opts.profile === undefined ? { role: 'admin', status: 'active' } : opts.profile
  const tables = opts.tables ?? {}
  const ops: Op[] = []
  const respond: Responder = (op) => {
    if (op.table === 'profiles' && op.kind === 'select' && op.selected === 'role, status') {
      return { data: profile, error: null }
    }
    if (op.kind !== 'select') {
      if (op.table === 'ai_prompts' && op.kind === 'insert') {
        return { data: { id: PROMPT_ID, ...(op.payload as object), created_at: 'agora' }, error: null }
      }
      return { data: null, error: null }
    }
    const value = tables[op.table]
    return { data: typeof value === 'function' ? value(op) : value ?? null, error: null }
  }
  const tools = new Map<string, Registered>()
  const server = {
    registerTool(name: string, config: Registered['config'], handler: Handler) {
      if (tools.has(name)) throw new Error(`duplicada: ${name}`)
      tools.set(name, { config, handler })
    },
  }
  const context = {
    supabase: fakeSupabase(respond, ops),
    userClaims: { id: ADMIN, email: 'admin@x.com', role: 'authenticated' },
    jwtClaims: { sub: ADMIN },
    // deno-lint-ignore no-explicit-any
  } as any as ToolContext
  // deno-lint-ignore no-explicit-any
  registerAdminTools(server as any, context)
  return { tools, ops }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`Falhou: ${msg}`)
}

const writes = (ops: Op[]) => ops.filter((o) => o.kind !== 'select')

Deno.test('lista de ferramentas esperada e sem nomes duplicados', () => {
  const names = [...setup().tools.keys()].sort()
  assert(
    JSON.stringify(names) ===
      JSON.stringify([
        'admin_activate_prompt',
        'admin_create_prompt',
        'admin_get_prompt',
        'admin_get_settings',
        'admin_list_prompts',
        'admin_list_users',
        'admin_recent_audit_log',
        'admin_update_setting',
        'whoami',
      ]),
    `ferramentas inesperadas: ${names.join(',')}`
  )
})

Deno.test('leituras declaram readOnlyHint e escritas não', () => {
  const { tools } = setup()
  for (const name of ['admin_get_settings', 'admin_list_prompts', 'admin_get_prompt', 'admin_list_users', 'admin_recent_audit_log']) {
    assert(tools.get(name)!.config.annotations?.readOnlyHint === true, `${name} deveria ser somente leitura`)
  }
  for (const name of ['admin_update_setting', 'admin_create_prompt', 'admin_activate_prompt']) {
    assert(tools.get(name)!.config.annotations?.readOnlyHint === false, `${name} deveria declarar escrita`)
  }
})

const SAMPLE_ARGS: Record<string, unknown> = {
  admin_get_settings: {},
  admin_update_setting: { key: 'trial', changes: { days: 7 }, dry_run: false },
  admin_list_prompts: { limit: 5 },
  admin_get_prompt: { id: PROMPT_ID },
  admin_create_prompt: { name: 'base', content: 'texto', active: true },
  admin_activate_prompt: { id: PROMPT_ID },
  admin_list_users: { limit: 5 },
  admin_recent_audit_log: { limit: 5 },
}

for (const [label, profile] of [
  ['usuário comum', { role: 'user', status: 'active' }],
  ['admin bloqueado', { role: 'admin', status: 'blocked' }],
  ['sem perfil', null],
] as const) {
  Deno.test(`${label}: toda ferramenta administrativa é negada sem ler nem gravar dados`, async () => {
    for (const [name, args] of Object.entries(SAMPLE_ARGS)) {
      const { tools, ops } = setup({ profile, tables: { admin_settings: [], ai_prompts: [], profiles: [] } })
      const res = await tools.get(name)!.handler(args)
      assert(res.isError === true && res.content[0].text === ADMIN_DENIED, `${name} não negou (${label})`)
      assert(ops.length === 1 && ops[0].table === 'profiles', `${name} tocou outras tabelas (${label})`)
      assert(writes(ops).length === 0, `${name} gravou algo (${label})`)
    }
  })
}

Deno.test('a checagem de admin usa a identidade do token', async () => {
  const { tools, ops } = setup({ tables: { admin_settings: [] } })
  await tools.get('admin_get_settings')!.handler({})
  assert(ops[0].filters.some(([k, c, v]) => k === 'eq' && c === 'id' && v === ADMIN), 'não filtrou pelo id do token')
})

Deno.test('admin_get_settings completa com os padrões', async () => {
  const { tools } = setup({ tables: { admin_settings: [{ key: 'trial', value: { days: 9, ai_requests: null, documents: null, petitions: null, max_tokens: null, on_expire: 'view' }, updated_at: 'd' }] } })
  const all = (await tools.get('admin_get_settings')!.handler({})).structuredContent
  assert(all.settings.trial.days === 9, 'não leu o valor salvo')
  assert(all.settings.plan.price_brl === 44.9, 'não aplicou o padrão')
  const one = (await tools.get('admin_get_settings')!.handler({ key: 'trial' })).structuredContent
  assert(one.key === 'trial' && one.value.on_expire === 'view' && one.updated_at === 'd', 'leitura de uma chave falhou')
})

Deno.test('admin_update_setting mescla só os campos informados, grava e audita', async () => {
  const { tools, ops } = setup({ tables: { admin_settings: null } })
  const res = await tools.get('admin_update_setting')!.handler({ key: 'trial', changes: { days: 7 }, dry_run: false })
  assert(!res.isError, `erro inesperado: ${res.content?.[0]?.text}`)
  const out = res.structuredContent
  assert(JSON.stringify(out.changed) === '["days"]', `campos alterados: ${out.changed}`)
  assert(out.before.days === 3 && out.after.days === 7 && out.after.on_expire === 'block', 'mescla incorreta')

  const upsert = ops.find((o) => o.kind === 'upsert')!
  const payload = upsert.payload as { key: string; value: { days: number }; updated_by: string }
  assert(upsert.table === 'admin_settings' && payload.key === 'trial' && payload.value.days === 7, 'upsert errado')
  assert(payload.updated_by === ADMIN, 'updated_by errado')

  const log = ops.find((o) => o.table === 'admin_audit_log')!
  const entry = log.payload as { actor_id: string; action: string; target: string }
  assert(log.kind === 'insert' && entry.actor_id === ADMIN && entry.action === 'settings.update' && entry.target === 'trial', 'auditoria ausente')
})

Deno.test('admin_update_setting mescla objetos aninhados (módulos do plano)', async () => {
  const { tools, ops } = setup({ tables: { admin_settings: null } })
  const res = await tools.get('admin_update_setting')!.handler({ key: 'plan', changes: { features: { agenda_files: true } }, dry_run: false })
  const after = res.structuredContent.after
  assert(after.features.agenda_files === true && after.features.assistant === true, 'perdeu módulos existentes')
  assert(writes(ops).some((o) => o.kind === 'upsert'), 'não gravou')
})

Deno.test('dry_run mostra antes e depois sem gravar nada', async () => {
  const { tools, ops } = setup({ tables: { admin_settings: null } })
  const res = await tools.get('admin_update_setting')!.handler({ key: 'plan', changes: { price_brl: 59.9 }, dry_run: true })
  const out = res.structuredContent
  assert(out.dry_run === true && out.before.price_brl === 44.9 && out.after.price_brl === 59.9, 'prévia errada')
  assert(writes(ops).length === 0, 'dry_run gravou')
})

Deno.test('mp_plan_id é preservado e não pode ser alterado pelo MCP', async () => {
  const stored = {
    price_brl: 44.9, tokens_month: null, renewal: 'auto', available: true, mp_plan_id: 'MP-123',
    features: { assistant: true, petitions: true, documents: true, process_lookup: false, legislation: false, case_law: false, agenda_files: false },
  }
  const blocked = setup({ tables: { admin_settings: { value: stored } } })
  const res1 = await blocked.tools.get('admin_update_setting')!.handler({ key: 'plan', changes: { mp_plan_id: 'X' }, dry_run: false })
  assert(res1.isError === true && writes(blocked.ops).length === 0, 'aceitou mp_plan_id')

  const kept = setup({ tables: { admin_settings: { value: stored } } })
  const res2 = await kept.tools.get('admin_update_setting')!.handler({ key: 'plan', changes: { price_brl: 50 }, dry_run: false })
  assert(res2.structuredContent.after.mp_plan_id === 'MP-123', 'perdeu o mp_plan_id')
})

Deno.test('campos desconhecidos, __proto__ e valores inválidos são recusados sem gravar', async () => {
  for (const [changes, expect] of [
    [{ dias: 7 }, 'Campos desconhecidos'],
    [JSON.parse('{"__proto__": {"days": 1}}'), 'Campos desconhecidos'],
    [{ days: 500 }, 'Valores inválidos'],
    [{ on_expire: 'apagar' }, 'Valores inválidos'],
    [{ days: '7' }, 'Valores inválidos'],
  ] as const) {
    const { tools, ops } = setup({ tables: { admin_settings: null } })
    const res = await tools.get('admin_update_setting')!.handler({ key: 'trial', changes, dry_run: false })
    assert(res.isError === true && String(res.content[0].text).includes(expect), `aceitou ${JSON.stringify(changes)}`)
    assert(writes(ops).length === 0, `gravou ${JSON.stringify(changes)}`)
  }
})

Deno.test('sem mudança real não grava', async () => {
  const { tools, ops } = setup({ tables: { admin_settings: null } })
  const res = await tools.get('admin_update_setting')!.handler({ key: 'trial', changes: { days: 3 }, dry_run: false })
  assert(res.structuredContent.changed.length === 0 && writes(ops).length === 0, 'gravou sem mudança')
})

Deno.test('admin_create_prompt grava inativo, depois ativa só a nova versão e audita', async () => {
  const { tools, ops } = setup({ tables: { ai_prompts: { version: 2 } } })
  const res = await tools.get('admin_create_prompt')!.handler({ name: 'base', content: 'texto', active: true })
  assert(!res.isError && res.structuredContent.prompt.active === true, 'não ativou')
  const w = writes(ops)
  const insert = w[0].payload as { version: number; active: boolean; created_by: string }
  assert(w[0].kind === 'insert' && insert.version === 3 && insert.active === false && insert.created_by === ADMIN, 'insert errado')
  assert(w[1].kind === 'update' && w[1].filters.some(([k, c, v]) => k === 'neq' && c === 'id' && v === PROMPT_ID), 'desativação errada')
  assert(w[2].kind === 'update' && w[2].filters.some(([k, c, v]) => k === 'eq' && c === 'id' && v === PROMPT_ID), 'ativação errada')
  assert(w[3].table === 'admin_audit_log' && (w[3].payload as { action: string }).action === 'prompt.create', 'sem auditoria')
})

Deno.test('admin_create_prompt sem active não mexe no prompt ativo', async () => {
  const { tools, ops } = setup({ tables: { ai_prompts: null } })
  await tools.get('admin_create_prompt')!.handler({ name: 'base', content: 'texto', active: false })
  assert(!writes(ops).some((o) => o.kind === 'update'), 'alterou o prompt ativo')
})

Deno.test('admin_activate_prompt troca o ativo e audita; inexistente dá erro', async () => {
  const ok = setup({ tables: { ai_prompts: { id: PROMPT_ID, name: 'base', version: 1, active: false } } })
  const res = await ok.tools.get('admin_activate_prompt')!.handler({ id: PROMPT_ID })
  assert(!res.isError && res.structuredContent.prompt.active === true, 'não ativou')
  assert(writes(ok.ops).some((o) => o.table === 'admin_audit_log'), 'sem auditoria')

  const missing = setup({ tables: { ai_prompts: null } })
  const res2 = await missing.tools.get('admin_activate_prompt')!.handler({ id: PROMPT_ID })
  assert(res2.isError === true && writes(missing.ops).length === 0, 'ativou prompt inexistente')
})

Deno.test('admin_list_users escapa curingas da busca por e-mail', async () => {
  const { tools, ops } = setup({ tables: { profiles: [] } })
  await tools.get('admin_list_users')!.handler({ limit: 10, email_contains: '50%_off', status: 'blocked' })
  const list = ops[1]
  assert(list.filters.some(([k, c, v]) => k === 'ilike' && c === 'email' && v === '%50\\%\\_off%'), 'busca não escapada')
  assert(list.filters.some(([k, c, v]) => k === 'eq' && c === 'status' && v === 'blocked'), 'sem filtro de situação')
  assert(list.limit === 10, 'ignorou o limite')
})

Deno.test('log de auditoria nunca devolve antes/depois de credenciais', async () => {
  const { tools } = setup({
    tables: {
      admin_audit_log: [
        { action: 'secret.update', target: 'OPENAI_API_KEY', before: null, after: { last4: 'abcd' } },
        { action: 'settings.update', target: 'trial', before: { days: 3 }, after: { days: 7 } },
      ],
    },
  })
  const entries = (await tools.get('admin_recent_audit_log')!.handler({ limit: 5 })).structuredContent.entries
  assert(entries[0].after === null, 'vazou dado de credencial')
  assert(entries[1].after.days === 7, 'escondeu dado comum')
})

Deno.test('entradas inválidas são rejeitadas pelos esquemas', () => {
  const { tools } = setup()
  const upd = tools.get('admin_update_setting')!.config.inputSchema!
  assert(!upd.safeParse({ key: 'segredos', changes: { a: 1 } }).success, 'chave desconhecida aceita')
  assert(!upd.safeParse({ key: 'trial', changes: {} }).success, 'changes vazio aceito')
  assert(upd.safeParse({ key: 'trial', changes: { days: 7 } }).success, 'entrada válida recusada')
  const get = tools.get('admin_get_prompt')!.config.inputSchema!
  assert(!get.safeParse({ id: "x' or '1'='1" }).success, 'id não-UUID aceito')
  const create = tools.get('admin_create_prompt')!.config.inputSchema!
  assert(!create.safeParse({ name: '', content: 'x' }).success, 'nome vazio aceito')
  assert(!create.safeParse({ name: 'a', content: 'x'.repeat(20_001) }).success, 'conteúdo grande aceito')
  const users = tools.get('admin_list_users')!.config.inputSchema!
  assert(!users.safeParse({ limit: 1000 }).success, 'limite alto aceito')
})

Deno.test('erro do banco vira resposta de erro sem lançar exceção', async () => {
  const dbError = Object.assign(new Error('boom'), { code: 'XX000' })
  const ops: Op[] = []
  const supabase = fakeSupabase(() => ({ data: null, error: dbError }), ops)
  const captured = new Map<string, Handler>()
  // deno-lint-ignore no-explicit-any
  registerAdminTools({ registerTool: (n: string, _c: unknown, h: Handler) => captured.set(n, h) } as any, { supabase, userClaims: { id: ADMIN }, jwtClaims: {} } as any)
  const res = await captured.get('admin_get_settings')!({})
  assert(res.isError === true && String(res.content[0].text).includes('[XX000] boom'), 'erro não tratado')
})

Deno.test('funções auxiliares', () => {
  assert(JSON.stringify(unknownPaths({ a: 1, b: { c: 1 } }, { a: 2, b: { d: 1 }, e: 1 })) === '["b.d","e"]', 'unknownPaths')
  assert(JSON.stringify(deepMerge({ a: 1, b: { c: 1, d: 2 } }, { b: { c: 9 } })) === '{"a":1,"b":{"c":9,"d":2}}', 'deepMerge')
  assert(JSON.stringify(changedPaths({ a: 1, b: { c: 1 } }, { a: 1, b: { c: 2 } })) === '["b.c"]', 'changedPaths')
  assert(escapeLike('a\\b%c_d') === 'a\\\\b\\%c\\_d', 'escapeLike')
})
