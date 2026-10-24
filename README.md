# JusLegis

SaaS jurídico **exclusivo para advogados**: assistente de IA, redação de petições, pesquisa restrita a fontes oficiais habilitadas e workspace individual por advogado, com Admin Geral separado. Os protótipos originais estão em `design-reference/` (fora do build).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Auth, Postgres com RLS, Storage) via `@supabase/ssr` · OpenAI API (somente servidor) · Mercado Pago (somente Sandbox) · Vercel · Vitest · Zod.

## Rotas

| Rota | Acesso |
|---|---|
| `/login` | público (Google + código por e-mail) |
| `/auth/callback`, `/auth/signout` | callback OAuth/OTP e logout |
| `/app/*` | usuário logado; workspace isolado por RLS |
| `/admin/*` | somente `profiles.role = 'admin'` ativo, validado no servidor |
| `/acesso-negado` | destino de quem não é admin ou tem conta bloqueada |
| `/api/assistant`, `/api/petitions/ai`, `/api/legal/research` | usuário autenticado; chamadas OpenAI só no servidor |
| `/api/billing/*`, `/api/webhooks/mercadopago` | checkout sandbox; webhook com assinatura HMAC e idempotência |

## Instalar e rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com valores do SEU projeto; nunca versione
npm run dev                  # http://localhost:3000
```

Scripts: `npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
(pouca RAM: `SKIP_NEXT_TYPECHECK=1 npm run build` após o typecheck).
Sem credenciais o build funciona, mas login e integrações ficam indisponíveis.

## Variáveis de ambiente (`.env.example`)

Variáveis sem `NEXT_PUBLIC_` existem somente no servidor. Nunca coloque segredos em `NEXT_PUBLIC_`.

| Variável | Uso | Visibilidade |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publishable/anon (protegida por RLS); `NEXT_PUBLIC_SUPABASE_ANON_KEY` segue aceita | pública |
| `SUPABASE_SERVICE_ROLE_KEY` | webhooks, testes de conexão, configurações admin | **segredo** |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | URLs base para redirects de login e retorno do checkout | pública |
| `OPENAI_API_KEY` | chave OpenAI da plataforma | **segredo** |
| `OPENAI_MODEL` | modelo padrão (o Admin Geral pode sobrescrever) | servidor |
| `MERCADO_PAGO_ACCESS_TOKEN` | token de **teste** | **segredo** |
| `MERCADO_PAGO_WEBHOOK_SECRET` | segredo da assinatura de webhooks | **segredo** |
| `MERCADO_PAGO_ENVIRONMENT` | mantenha `sandbox` | servidor |
| `BILLING_ENABLED` | trava; só o valor exato `true` libera criação de checkout. Mantenha `false` | servidor |
| `DATAJUD_API_URL` / `DATAJUD_API_KEY` | integração DataJud futura | servidor / **segredo** |

Nomes legados (`MP_ENVIRONMENT`, `MP_ACCESS_TOKEN_TEST`, `MP_WEBHOOK_SECRET`) continuam aceitos.

## Conectar ao Supabase dedicado

1. Use um projeto Supabase **exclusivo da JusLegis**. Confira o nome e o Project Ref no dashboard do proprietário antes de copiar URL e chaves; não reutilize projeto ou credenciais de outro aplicativo.
2. Se o banco estiver vazio, aplique em ordem de timestamp todos os arquivos de `supabase/migrations/` (SQL Editor ou Supabase CLI). RLS permanece ativo em todas as tabelas privadas; não crie políticas `USING (true)`.
3. Copie a URL, a chave publishable e a service role desse projeto para `.env.local` (e para a Vercel). A URL e a chave publishable são usadas no cliente; a service role é secreta e exclusiva do servidor. A Vercel não executa migrações.

## Login por e-mail, OTP e Google

No dashboard do Supabase:
1. **Authentication → Providers → Email**: habilite; permita novos cadastros (*Allow new users to sign up*). O fluxo usa `signInWithOtp`; no template de e-mail inclua `{{ .Token }}`. Habilite recuperação de acesso.
2. **Authentication → Providers → Google**: habilite. No Google Cloud Console crie uma credencial OAuth *Web application* e registre como redirect URI o callback exibido pelo Supabase (`https://<PROJECT_REF>.supabase.co/auth/v1/callback`); copie Client ID e Secret para o Supabase.
3. **Authentication → URL Configuration**: Site URL do ambiente testado e Redirect URLs para `http://localhost:3000/auth/callback`, a URL exata do Preview `https://<preview>.vercel.app/auth/callback` e a de produção.
4. **SMTP próprio** é recomendado antes de testes com usuários externos (o SMTP padrão tem limite baixo de envios).

Testar: cadastro com e-mail → receber código → entrar em `/app`; sair e entrar novamente; login Google; recuperação de acesso. Provedor desabilitado ou cadastro indisponível exibem mensagem clara; erros de configuração não são mascarados.

## Promover o primeiro Admin Geral com segurança

O papel de admin nunca é definido no frontend nem via `user_metadata`; o usuário não consegue alterar o próprio papel. Faça esta operação apenas com acesso autorizado ao projeto dedicado.
1. Cadastre a conta pretendida normalmente e faça o primeiro login (o perfil é criado automaticamente).
2. Confirme o e-mail exato dessa conta. No SQL Editor do projeto Supabase dedicado, substitua o e-mail de exemplo em `supabase/promote-admin.sql` pelo e-mail confirmado e execute o script.
3. Saia e entre novamente; `/admin` passa a abrir. Qualquer outro usuário é redirecionado a `/acesso-negado`.

## OpenAI sem expor a chave

- Defina `OPENAI_API_KEY` apenas como variável de servidor (`.env.local` / Vercel). O advogado nunca informa chave própria.
- Toda chamada OpenAI ocorre em rotas server-side, com sessão válida, limites configuráveis e registro de consumo.
- O modelo vem de `OPENAI_MODEL` ou do Admin Geral (`/admin/ia`), nunca do cliente.
- Em `/admin/apis` há testes de conexão que fazem chamadas reais e podem gerar custo.
- A IA não substitui revisão humana e não afirma ter consultado fonte jurídica sem fonte oficial integrada.

## DataJud: limitações e configuração futura

Não há integração DataJud/CNJ ativa: nenhum dado processual é consultado, simulado ou fabricado. A consulta deve exibir "Consulta ainda não configurada" até existirem `DATAJUD_API_URL` e `DATAJUD_API_KEY` e um adaptador server-side. Ao implementar: usar a API pública oficial do CNJ e a chave/termos vigentes, e distinguir metadados processuais de conteúdo integral (a API não fornece inteiro teor).

## Mercado Pago (somente Sandbox)

- Plano Essencial R$ 44,90/mês (editável pelo Admin) e teste de 72 horas sem cartão.
- Use apenas credenciais e usuários de teste do Mercado Pago; `MERCADO_PAGO_ENVIRONMENT=sandbox` e `BILLING_ENABLED=false` por padrão. As rotas recusam o ambiente de produção.
- Cadastre no painel do Mercado Pago a URL `<site>/api/webhooks/mercadopago` e use o segredo em `MERCADO_PAGO_WEBHOOK_SECRET`.
- A assinatura só é liberada após o status ser reconsultado e confirmado; eventos duplicados são ignorados (idempotência por evento).
- Habilite `BILLING_ENABLED` somente no Preview protegido, durante teste autorizado.

## Publicar Preview na Vercel

1. Use o projeto Vercel existente (Root Directory `.`, preset Next.js, `npm run build`). Não faça deploy em Production nesta etapa.
2. Cadastre as variáveis: Supabase (URL, publishable, service role) e `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_APP_URL` em **Preview e Production**; OpenAI, Mercado Pago e DataJud apenas quando for testá-los (Preview, com valores de teste).
3. Ative a proteção de deployment no Preview antes de usar dados reais.
4. Adicione a URL do Preview às Redirect URLs do Supabase.
5. Faça push da branch; a Vercel gera o Preview. Execute o checklist de testes manuais abaixo.

## Checklist de segurança

- [ ] Nenhum segredo em `NEXT_PUBLIC_` nem versionado; `.env.local` fora do git.
- [ ] Service role, OpenAI e Mercado Pago apenas no servidor (`server-only`).
- [ ] Projeto Supabase é o dedicado, não o do CRM.
- [ ] RLS ativo; nenhuma política permissiva em dados privados.
- [ ] Autorização por papel no banco/servidor, nunca `user_metadata`.
- [ ] `/app` exige sessão; `/admin` exige admin validado (`requireAdmin`, `apiRequireAdmin`, `is_admin()`).
- [ ] Arquivos em bucket privado por usuário.
- [ ] Webhook com assinatura e idempotência; cobrança real desativada.
- [ ] Proteção de deployment no Preview.

## Checklist de testes manuais (Preview)

- [ ] Cadastro por e-mail: código chega e entra em `/app`.
- [ ] Login por código de usuário existente; sessão persiste após recarregar; logout funciona.
- [ ] Login com Google.
- [ ] Recuperação de acesso.
- [ ] `/app` sem sessão redireciona ao login.
- [ ] Usuário comum em `/admin` é redirecionado/negado; admin promovido acessa.
- [ ] Usuário A não vê documentos/conversas do usuário B.
- [ ] Rotas de IA recusam requisição sem sessão (401).
- [ ] Teste de IA com `OPENAI_API_KEY` configurada e limite de uso respeitado.
- [ ] Checkout sandbox e webhook duplicado sem duplicar pagamento.

## Limitações conhecidas e itens que exigem credenciais do proprietário

- Dependem de credenciais/dashboard do proprietário e **não foram validados**: envio real de OTP (SMTP), Google OAuth, OpenAI, DataJud e Mercado Pago sandbox.
- DataJud não implementado; doutrina e consulta processual indisponíveis.
- Alteração de plano de assinatura existente indisponível; módulos de custos/monitoramento do Admin pendentes.
- A validação técnica de links de fontes não substitui a conferência jurídica pelo advogado.
- O acesso a dados concentra-se em `src/lib/supabase/*` e `src/lib/runtime.ts`, facilitando migração futura de backend.
