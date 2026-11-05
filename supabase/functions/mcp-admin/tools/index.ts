import type { McpServer } from 'npm:@modelcontextprotocol/server@2.0.0'

import { registerWhoamiTool } from '../../mcp/tools/whoami.ts'
import type { ToolContext } from '../../mcp/tools/types.ts'
import { registerAdminTools as registerAdminSettingsTools } from './admin.ts'

export type { ToolContext } from '../../mcp/tools/types.ts'

// Ponto único de composição do MCP administrativo. As ferramentas dos advogados
// (função "mcp") não entram aqui, e as administrativas não entram lá.
export function registerAdminTools(server: McpServer, context: ToolContext): void {
  registerWhoamiTool(server, context)
  registerAdminSettingsTools(server, context)
}
