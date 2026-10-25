# MCP da JusLegis

Servidor MCP (Model Context Protocol) para que advogados conectem a própria conta da JusLegis a clientes compatíveis, como o Claude. Roda como Edge Function do Supabase (`supabase/functions/mcp`), instalada com `npx shadcn@latest add @supabase/mcp` (bloco oficial da Supabase Library).

## Não confundir

| | MCP administrativo da Supabase | MCP da JusLegis (este) |
|---|---|---|
| Quem usa | Equipe técnica | Advogados, cada um com a própria conta |
| O que faz | Gerencia projeto, SQL, migrações | Lê casos, petições, documentos e conversas do próprio usuário |
| Endereço | `mcp.supabase.com` | `https://hbqlwwnnbvritknwwzos.supabase.co/functions/v1/mcp` |
| Acesso | Token de administrador | Login do advogado + consentimento OAuth |

Os advogados nunca recebem operações administrativas de banco de dados.

## Como funciona

1. O cliente MCP chama a função sem token e recebe `401` com `WWW-Authenticate` apontando para `/functions/v1/mcp/oauth-protected-resource`.
2. Ele descobre o servidor OAuth do Supabase, se registra (registro dinâmico) e abre o navegador em `/oauth/consent?authorization_id=...` (tela da JusLegis, `src/app/oauth/consent`).
3. Sem sessão, a tela leva ao `/login` e volta para o mesmo endereço (parâmetro `next`, só caminhos internos).
4. O advogado vê o aplicativo, o endereço de retorno e as permissões, e escolhe Permitir ou Negar.
5. Cada chamada leva o token do usuário. A função valida o token e entrega às ferramentas um cliente **com as permissões dele** (RLS). Não existe cliente administrativo no contexto das ferramentas.

## Ferramentas (todas somente leitura)

`whoami`, `list_cases`, `list_petitions`, `get_petition` (texto, até 20 mil caracteres), `list_documents` (apenas metadados; sem caminho de armazenamento), `list_conversations`.

Isolamento em duas camadas: RLS das tabelas e filtro explícito `user_id = identidade do token` em cada consulta. Entradas validadas com zod (limite 1 a 50, UUID). Não há ferramentas de escrita, consulta processual, jurisprudência ou IA: nada é inventado, e fontes jurídicas só entram quando houver integração real e autorizada.

## Revisão da função `activate_trial`

É `SECURITY DEFINER`, com `search_path` vazio, exige `auth.uid()` e altera apenas a linha do próprio usuário; `anon` e `public` não têm execução. O aviso do Supabase sobre "função SECURITY DEFINER executável por `authenticated`" é esperado aqui. Nenhuma mudança foi feita.

## Implantação (exige o seu painel Supabase)

Projeto **hbqlwwnnbvritknwwzos** (nunca `odoavqqihukvpsmvopvf`).

1. **Chaves de assinatura JWT assimétricas**: Settings > JWT Keys. Tokens HS256 (segredo legado) são rejeitados pela função.
2. **Servidor OAuth**: Authentication > OAuth Server > ativar; *Authorization URL path* = `/oauth/consent`; registro dinâmico ativado.
3. **Site URL** do Auth = origem que serve `/oauth/consent` (HTTPS). Em Preview, adicione também a URL do Preview em *Redirect URLs*.
4. **Implantar a função** (CLI 2.117 ou superior, logado com o seu token de acesso):
   ```bash
   supabase link --project-ref hbqlwwnnbvritknwwzos
   supabase secrets set --env-file supabase/functions/.env   # copie de supabase/functions/mcp/.env.example
   supabase functions deploy mcp                              # lê verify_jwt=false de supabase/config.toml
   ```
   **Não rode `supabase config push`** com o `config.toml` deste repositório: ele contém só o mínimo e enviaria valores padrão para o restante da configuração do Auth.
5. Confirme `BILLING_ENABLED=false` e Mercado Pago em sandbox nas variáveis da Vercel.

`verify_jwt=false` é necessário porque a descoberta OAuth precisa responder sem token; a própria função autentica (`withSupabase({ auth: 'user' })`) e responde `401` sem token válido.

## Conectar ao Claude

Em Configurações > Conectores > Adicionar conector personalizado, informe `https://hbqlwwnnbvritknwwzos.supabase.co/functions/v1/mcp`. O Claude abre a tela de consentimento da JusLegis; entre com a sua conta e clique em Permitir acesso. Para revogar, remova o conector ou revogue a concessão da conta.

## Testes

- Função: `cd supabase/functions/mcp && deno task check && deno task test` (precisa do Deno).
- App: `npm run lint && npm run typecheck && npm test && npm run build`.
- Banco: `supabase/tests/rls_isolation.sql` no SQL Editor do projeto da JusLegis (termina em `ROLLBACK`).
