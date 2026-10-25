import { registerTools } from './index.ts'
import type { ToolContext } from './types.ts'

// Testes unitários com cliente Supabase simulado: comprovam que TODA consulta de dado
// do advogado é filtrada pela identidade verificada do token (defesa além do RLS),
// que não existem ferramentas de escrita e que as entradas são validadas.

type Call = { table: string; filters: Array<[string, unknown]>; limit?: number; selected?: string }

function fakeSupabase(rowsByTable: Record<string, unknown[]>, calls: Call[]) {
  return {
    from(table: string) {
      const call: Call = { table, filters: [] }
      calls.push(call)
      const rows = () => rowsByTable[table] ?? []
      const builder: Record<string, unknown> = {
        select(cols: string) {
          call.selected = cols
          return builder
        },
        eq(col: string, val: unknown) {
          call.filters.push([col, val])
          return builder
        },
        order() {
          return builder
        },
        limit(n: number) {
          call.limit = n
          return Promise.resolve({ data: rows(), error: null })
        },
        maybeSingle() {
          return Promise.resolve({ data: rows()[0] ?? null, error: null })
        },
      }
      return builder
    },
  }
}

// deno-lint-ignore no-explicit-any
type Handler = (args: any) => Promise<any> | any
type Registered = { config: { inputSchema?: { safeParse: (v: unknown) => { success: boolean } }; annotations?: Record<string, boolean> }; handler: Handler }

function setup(userId: string, rows: Record<string, unknown[]> = {}) {
  const calls: Call[] = []
  const tools = new Map<string, Registered>()
  const server = {
    registerTool(name: string, config: Registered['config'], handler: Handler) {
      if (tools.has(name)) throw new Error(`duplicada: ${name}`)
      tools.set(name, { config, handler })
    },
  }
  const context = {
    supabase: fakeSupabase(rows, calls),
    userClaims: { id: userId, email: 'a@x.com', role: 'authenticated' },
    jwtClaims: { sub: userId },
    // deno-lint-ignore no-explicit-any
  } as any as ToolContext
  // deno-lint-ignore no-explicit-any
  registerTools(server as any, context)
  return { tools, calls }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`Falhou: ${msg}`)
}

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

Deno.test('lista de ferramentas esperada e sem nomes duplicados', () => {
  const { tools } = setup(USER_A)
  const names = [...tools.keys()].sort()
  assert(
    JSON.stringify(names) ===
      JSON.stringify(['get_petition', 'list_cases', 'list_conversations', 'list_documents', 'list_petitions', 'whoami']),
    `ferramentas inesperadas: ${names.join(',')}`
  )
})

Deno.test('todas as ferramentas são somente leitura', () => {
  const { tools } = setup(USER_A)
  for (const [name, t] of tools) {
    assert(t.config.annotations?.readOnlyHint === true, `${name} sem readOnlyHint`)
    assert(t.config.annotations?.destructiveHint === false, `${name} deveria declarar destructiveHint=false`)
  }
})

Deno.test('cada listagem filtra por user_id do token (usuário A não pede dados de B)', async () => {
  for (const [name, table] of [
    ['list_cases', 'cases'],
    ['list_petitions', 'petitions'],
    ['list_documents', 'documents'],
    ['list_conversations', 'conversations'],
  ] as const) {
    const { tools, calls } = setup(USER_A, { [table]: [{ id: 'x' }] })
    await tools.get(name)!.handler({ limit: 5 })
    const call = calls[0]
    assert(call.table === table, `${name} consultou ${call.table}`)
    assert(
      call.filters.some(([c, v]) => c === 'user_id' && v === USER_A),
      `${name} sem filtro user_id=A`
    )
    assert(!call.filters.some(([, v]) => v === USER_B), `${name} filtrou pelo usuário errado`)
    assert(call.limit === 5, `${name} ignorou o limite`)
  }
})

Deno.test('listagem de documentos não pede o caminho de armazenamento', async () => {
  const { tools, calls } = setup(USER_A)
  await tools.get('list_documents')!.handler({ limit: 5 })
  assert(!String(calls[0].selected).includes('storage_path'), 'storage_path exposto')
})

Deno.test('get_petition filtra por id E por user_id e retorna erro se não achar', async () => {
  const { tools, calls } = setup(USER_A, { petitions: [] })
  const res = await tools.get('get_petition')!.handler({ id: '33333333-3333-4333-8333-333333333333' })
  assert(res.isError === true, 'deveria ser erro quando a petição não é do usuário')
  const f = calls[0].filters
  assert(f.some(([c, v]) => c === 'user_id' && v === USER_A), 'sem filtro user_id')
  assert(f.some(([c]) => c === 'id'), 'sem filtro id')
})

Deno.test('get_petition devolve texto sem HTML e trunca textos longos', async () => {
  const html = '<p>Olá <b>mundo</b></p><script>alert(1)</script>' + '<p>' + 'a'.repeat(25000) + '</p>'
  const { tools } = setup(USER_A, { petitions: [{ id: 'p', title: 'T', step: 2, content_html: html, updated_at: 'd' }] })
  const res = await tools.get('get_petition')!.handler({ id: '33333333-3333-4333-8333-333333333333' })
  const out = res.structuredContent
  assert(out.truncated === true && out.text.length === 20000, 'não truncou')
  assert(!out.text.includes('<') && !out.text.includes('alert'), 'HTML ou script vazou')
  assert(out.text.startsWith('Olá mundo'), 'texto inesperado')
})

Deno.test('entradas inválidas são rejeitadas pelo esquema', () => {
  const { tools } = setup(USER_A)
  const list = tools.get('list_cases')!.config.inputSchema!
  assert(!list.safeParse({ limit: 0 }).success, 'limit 0 aceito')
  assert(!list.safeParse({ limit: 1000 }).success, 'limit 1000 aceito')
  assert(!list.safeParse({ limit: '5; drop table' }).success, 'limit texto aceito')
  assert(list.safeParse({}).success, 'padrão deveria ser aceito')
  const get = tools.get('get_petition')!.config.inputSchema!
  assert(!get.safeParse({ id: "x' or '1'='1" }).success, 'id não-UUID aceito')
  assert(!get.safeParse({}).success, 'id ausente aceito')
})

Deno.test('erro do banco vira resposta de erro sem lançar exceção', async () => {
  // PostgrestError do supabase-js estende Error e carrega "code".
  const dbError = Object.assign(new Error('boom'), { code: 'XX000' })
  const ctx = {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: dbError }) }) }),
        }),
      }),
    },
    userClaims: { id: USER_A },
    jwtClaims: {},
  }
  const captured = new Map<string, Handler>()
  // deno-lint-ignore no-explicit-any
  registerTools({ registerTool: (n: string, _c: unknown, h: Handler) => captured.set(n, h) } as any, ctx as any)
  const res = await captured.get('list_cases')!({ limit: 3 })
  assert(res.isError === true && String(res.content[0].text).includes('[XX000] boom'), 'erro não tratado')
})
