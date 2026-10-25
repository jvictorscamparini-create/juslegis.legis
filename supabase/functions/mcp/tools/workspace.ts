import type { McpServer } from 'npm:@modelcontextprotocol/server@2.0.0'
import { z } from 'npm:zod@4.4.3'

import { errorResult, jsonResult, runtimeErrorResult } from './result.ts'
import type { ToolContext } from './types.ts'

// Ferramentas de LEITURA do workspace individual do advogado.
//
// Isolamento em duas camadas:
//   1. O cliente é o do próprio usuário (JWT dele), então as políticas RLS das
//      tabelas já impedem ler dados de terceiros.
//   2. Cada consulta também filtra por user_id = identidade verificada do token,
//      para que o isolamento não dependa de uma única barreira.
// Nenhuma ferramenta escreve, apaga ou executa SQL. Não há cliente administrativo aqui.

const MAX_PAGE = 50
const DEFAULT_PAGE = 20
const MAX_PETITION_CHARS = 20000

const pageSchema = z.object({
  limit: z.number().int().min(1).max(MAX_PAGE).default(DEFAULT_PAGE).describe('Máximo de itens (1 a 50).'),
})

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

/** Remove marcação HTML para devolver só o texto da petição. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function registerWorkspaceTools(server: McpServer, { supabase, userClaims }: ToolContext): void {
  const userId = userClaims.id

  server.registerTool(
    'list_cases',
    {
      description: 'Lista as pastas de caso do advogado autenticado, da mais recente para a mais antiga.',
      inputSchema: pageSchema,
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const { data, error } = await supabase
        .from('cases')
        .select('id, name, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return runtimeErrorResult(error)
      return jsonResult({ cases: data ?? [] })
    }
  )

  server.registerTool(
    'list_petitions',
    {
      description:
        'Lista as petições do advogado autenticado (título, etapa e datas), sem o texto. Use get_petition para ler uma.',
      inputSchema: pageSchema,
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const { data, error } = await supabase
        .from('petitions')
        .select('id, title, step, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) return runtimeErrorResult(error)
      return jsonResult({ petitions: data ?? [] })
    }
  )

  server.registerTool(
    'get_petition',
    {
      description:
        'Devolve o texto de uma petição do advogado autenticado (limitado a 20 mil caracteres). Retorna erro se ela não existir ou não for dele.',
      inputSchema: z.object({ id: z.uuid().describe('Identificador da petição.') }),
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const { data, error } = await supabase
        .from('petitions')
        .select('id, title, step, content_html, updated_at')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) return runtimeErrorResult(error)
      if (!data) return errorResult('Petição não encontrada.')

      const text = htmlToText(String(data.content_html ?? ''))
      const truncated = text.length > MAX_PETITION_CHARS
      return jsonResult({
        id: data.id,
        title: data.title,
        step: data.step,
        updated_at: data.updated_at,
        text: truncated ? text.slice(0, MAX_PETITION_CHARS) : text,
        truncated,
      })
    }
  )

  server.registerTool(
    'list_documents',
    {
      description:
        'Lista os metadados dos documentos enviados pelo advogado autenticado (nome, tipo, tamanho). Não devolve o conteúdo nem o caminho de armazenamento.',
      inputSchema: pageSchema,
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, mime_type, size_bytes, context, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return runtimeErrorResult(error)
      return jsonResult({ documents: data ?? [] })
    }
  )

  server.registerTool(
    'list_conversations',
    {
      description: 'Lista as conversas do assistente do advogado autenticado (título e datas), sem as mensagens.',
      inputSchema: pageSchema,
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, title, case_id, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) return runtimeErrorResult(error)
      return jsonResult({ conversations: data ?? [] })
    }
  )
}
