import 'jsr:@supabase/functions-js@2.108.2/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.0.0'
import { pipeline } from 'npm:@supabase/middleware@1'
import {
  withOAuthProtectedResource,
  withSupabase,
  type SupabaseContext,
} from 'npm:@supabase/server@1'

import { registerAdminTools, type ToolContext } from './tools/index.ts'

// MCP do Administrador Geral da JusLegis, separado do MCP dos advogados (função "mcp").
//
// Mesmo pipeline da função "mcp":
//   withOAuthProtectedResource  descoberta OAuth para clientes MCP externos (Claude, ChatGPT).
//   withSupabase                valida o token do usuário e cria um cliente com as permissões
//                               DELE (RLS). Não há service role no contexto das ferramentas.
//   handleMcp                   transporte MCP e ferramentas (./tools).
//
// Proteção em três camadas: (1) token válido do Supabase Auth; (2) cada ferramenta confere em
// public.profiles se a pessoa é admin ativa antes de agir; (3) as políticas RLS do banco só
// deixam is_admin() ler e alterar admin_settings, ai_prompts e o log de auditoria.

function readTextEnv(name: string, fallback: string): string {
  return Deno.env.get(name)?.trim() || fallback
}

const SERVER_NAME = readTextEnv('MCP_ADMIN_SERVER_NAME', 'juslegis-admin-mcp')
const SERVER_DESCRIPTION = readTextEnv(
  'MCP_ADMIN_SERVER_DESCRIPTION',
  'Ferramentas do Administrador Geral da JusLegis: configurações do site, prompts da IA, usuários e log de auditoria.'
)

const SERVER_INSTRUCTIONS =
  `${SERVER_DESCRIPTION} ` +
  'Só funciona para contas com papel admin ativo; as demais recebem erro de acesso. ' +
  'Toda ferramenta roda como o usuário logado, com as políticas RLS do banco. ' +
  'Antes de alterar uma configuração, leia o valor atual com admin_get_settings e, quando possível, ' +
  'use dry_run=true para mostrar ao administrador o antes e o depois e pedir confirmação. ' +
  'Toda alteração fica registrada no log de auditoria.'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

function createServer(context: ToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  )

  registerAdminTools(server, context)
  return server
}

async function handleMcp(request: Request, ctx: SupabaseContext): Promise<Response> {
  // Servidor e ferramentas ficam presos a este usuário por exatamente uma requisição.
  const handler = createMcpHandler(
    () =>
      createServer({
        supabase: ctx.supabase,
        // auth: 'user' garante as duas formas de claims antes deste handler rodar.
        userClaims: ctx.userClaims!,
        jwtClaims: ctx.jwtClaims!,
      }),
    { onerror: (error) => console.error('MCP admin request failed', error) }
  )

  return handler.fetch(request)
}

// O handler é passado inline para o TypeScript inferir o contexto das entradas.
Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user', cors: { headers: CORS_HEADERS } })],
    (request, ctx) => handleMcp(request, ctx)
  )
)
