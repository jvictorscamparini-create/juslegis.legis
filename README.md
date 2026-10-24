# JusLegis

Plataforma de inteligência jurídica (Next.js 16 · React 19 · TypeScript · Supabase · OpenAI · Mercado Pago).
Os protótipos originais do Claude Design estão preservados em `design-reference/` (não fazem parte do build).

## Rotas

| Rota | Acesso |
|---|---|
| `/login` | público (Supabase Auth: Google + código por e-mail) |
| `/app/*` | usuário logado — workspace isolado por RLS |
| `/admin/*` | somente `profiles.role = 'admin'` ativo, verificado no servidor |
| `/acesso-negado` | destino de quem não é admin / conta bloqueada |
| `/api/webhooks/mercadopago` | assinatura HMAC validada |
| `/api/legal/research` | usuário autenticado; pesquisa restrita a fontes oficiais habilitadas |

## Executar localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev
```

Sem credenciais, o build não precisa de serviços externos, mas login e integrações ficam indisponíveis. A pesquisa jurídica permanece desabilitada até ser habilitada pelo Administrador Geral.

## Deploy na Vercel

O repositório já contém a aplicação Next.js; não crie um projeto novo. As fontes Cormorant Garamond e Plus Jakarta Sans são empacotadas localmente, então o build não precisa buscar fontes externas. Ao importar no dashboard da Vercel, use **Root Directory `.`** (raiz do repositório), framework preset **Next.js** e os comandos detectados pelo `package.json` (`npm run build` para build).

Antes do primeiro deploy:

1. **Use um projeto Supabase exclusivo da JusLegis.** Não reutilize banco de CRM ou de outro produto. Crie um projeto separado (`juslegis-dev`) e confira o Project Ref no dashboard antes de copiar URL e chaves. No projeto novo, aplique em ordem, pelo timestamp, todos os arquivos de `supabase/migrations/`; não execute alterações no banco atualmente configurado em Production.
2. No projeto dedicado, habilite o provedor **Email** e novos cadastros para o beta autorizado; o fluxo por código usa `signInWithOtp` com `shouldCreateUser` somente na opção “Criar conta”. Configure o template de confirmação para incluir `{{ .Token }}`. Habilite recuperação por e-mail. Após o primeiro login bem-sucedido da conta proprietária, execute `supabase/promote-admin.sql` com o e-mail correto.
3. Em **Authentication → URL Configuration**, configure a URL do deployment que será testado como Site URL e inclua a URL exata `https://<preview-gerado>.vercel.app/auth/callback` em Redirect URLs. O login Google e recuperação usam `/auth/callback`; após verificar o Preview, inclua também `https://juslegis.vercel.app/auth/callback` ao preparar uma troca de backend em Production, somente com aprovação.
4. Em **Authentication → Providers → Google**, habilite Google. No Google Cloud Console, configure a tela de consentimento e uma credencial OAuth **Web application**; registre como Authorized redirect URI o callback exibido pelo Supabase (formato `https://<PROJECT_REF>.supabase.co/auth/v1/callback`). Copie Client ID/Secret para o provedor Google no Supabase. Restrinja os usuários de teste na tela de consentimento enquanto estiver em modo Testing.
5. No projeto Vercel existente, configure as variáveis abaixo no escopo **Preview**, com os dados do projeto JusLegis dedicado. Não copie nem revele valores de Production e não substitua as variáveis Production do CRM sem aprovação explícita. Configure proteção de deployment para o Preview antes de usar dados reais; não compartilhe o endereço se a proteção não estiver disponível.
6. Cadastre na Vercel as variáveis necessárias listadas abaixo. `NEXT_PUBLIC_SITE_URL` deve ser a URL HTTPS do deployment correspondente ao ambiente.
7. Em `/admin/apis`, teste a Responses API e a pesquisa oficial. Esses testes fazem chamadas reais à OpenAI e podem gerar uso faturável.
8. Em `/admin/ia`, selecione um modelo permitido pela conta OpenAI. Fontes jurídicas iniciam desabilitadas; habilite apenas as categorias oficiais que pretende oferecer.

O teste é de 72 horas por padrão e começa na primeira ativação autenticada do workspace. A migração `20261023020000_trial_activation.sql` registra uma única ativação e congela a duração por usuário; contas já existentes são migradas com o período calculado pela configuração vigente, para preservar o acesso atual. Se o RPC dessa migração não estiver instalado, o acesso ao teste falha fechado.

**Não configure cobranças reais nesta etapa.** Mantenha `BILLING_ENABLED=false`, `MP_ENVIRONMENT=test` e não cadastre credenciais de produção. As rotas de criação/sincronização de plano e processamento de webhook recusam o ambiente `prod`; o cancelamento implementado também só atua sobre assinaturas de teste. Para um teste de checkout, use exclusivamente credenciais e usuários de teste do Mercado Pago e habilite `BILLING_ENABLED` somente no Preview protegido. A Vercel não executa migrações remotas automaticamente.

### Variáveis da Vercel

Necessárias para autenticação e funcionamento do servidor:

- `NEXT_PUBLIC_SITE_URL`: URL pública HTTPS do app.
- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: URL e chave pública/anon do projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta usada apenas no servidor; nunca use o prefixo `NEXT_PUBLIC_`.

Para Preview, todas as três variáveis Supabase devem pertencer ao projeto dedicado JusLegis, não ao banco CRM. Cadastre-as no ambiente **Preview** no projeto Vercel existente. Os nomes atuais do código continuam sendo `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.

Necessária para IA e pesquisa jurídica oficial (opcional para compilar/deploy):

- `OPENAI_API_KEY`: chave da plataforma API da OpenAI, mantida como segredo; assinatura ChatGPT não substitui créditos/API. Selecione um modelo permitido pela conta no Admin Geral.

Para validar Mercado Pago em sandbox, configure somente `MP_ACCESS_TOKEN_TEST` e `MP_WEBHOOK_SECRET` como segredos no Preview, `MP_ENVIRONMENT=test` e habilite o checkout apenas durante o teste autorizado. Nunca cadastre tokens de produção nesta etapa. A API existente usa Assinaturas/Preapproval; não habilite Pix ou outro meio recorrente sem confirmar a modalidade disponível na conta e na documentação da região. Não é necessária uma chave jurídica separada: a pesquisa usa a ferramenta web da OpenAI e só acontece quando o Admin Geral habilita fontes oficiais. Não há consulta de jurisprudência fora dos domínios configurados, doutrina ou consulta processual.

## Segurança

- Autorização de admin: `requireAdmin()` em `src/app/admin/layout.tsx` + `apiRequireAdmin()` em toda API admin + RLS (`is_admin()`) no banco. `proxy.ts` é só checagem otimista.
- Papel e situação do usuário não são graváveis pelo próprio usuário (grant de coluna só em `full_name`).
- Chaves OpenAI/Mercado Pago/service role só existem no servidor (`server-only`); a tela admin mostra apenas "definida / não definida".
- Dados dos advogados: RLS por `user_id`; arquivos em bucket privado `user-files/<user_id>/`.
- Webhook: assinatura validada, idempotência por evento, status reconsultado na API do Mercado Pago antes de liberar acesso.
- Pesquisa legal: busca OpenAI limitada a domínios oficiais; URLs precisam responder por HTTPS e permanecer em domínio autorizado, referências são armazenadas em tabela sem permissão de escrita pelo usuário. A validação técnica do link não substitui a conferência da vigência ou interpretação jurídica pelo advogado.

## Etapas ainda pendentes

- **Mercado Pago PJ:** o código implementa checkout mensal, cancelamento limitado a testes e webhooks assinados/idempotentes, mas ainda depende de credenciais de sandbox e teste real de ponta a ponta. Não declara pagamentos ou assinaturas funcionais antes dessa validação. Alteração de plano de uma assinatura existente ainda não está disponível.
- **Fontes jurídicas adicionais:** ampliar fontes jurisprudenciais mediante verificação das APIs, licenças e termos aplicáveis. Doutrina e consulta processual continuam indisponíveis; nenhum processo é consultado ou simulado.
- **Admin Geral:** configuração de modelo, prompts, limites, fontes e funcionalidades já existe; monitoramento/custos e demais módulos ainda precisam de implementação específica.

## Scripts

`npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
(em máquinas com pouca RAM: `SKIP_NEXT_TYPECHECK=1 npm run build` após rodar o typecheck)

## Checklist de configuração manual (Preview)

Projeto Supabase dedicado: `hbqlwwnnbvritknwwzos` (nunca usar `odoavqqihukvpsmvopvf`, CRM da Versátil).

**Supabase (Authentication)**: Email provider + OTP ativados; *Allow new users to sign up* ativado; Google provider ativado (Client ID/Secret do Google Cloud); SMTP próprio antes de testes externos; *Redirect URLs*: `http://localhost:3000/auth/callback`, `https://*-<time>.vercel.app/auth/callback` (Preview) e a URL de produção `/auth/callback`.

**Variáveis na Vercel** (ver `.env.example`):
- Preview e Production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (servidor), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`.
- Conforme habilitação: `OPENAI_API_KEY`, `OPENAI_MODEL`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_ENVIRONMENT=sandbox`, `DATAJUD_API_URL`, `DATAJUD_API_KEY`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `MP_*` continuam aceitos como nomes legados.

**Primeiro admin**: cadastre-se normalmente e execute `supabase/promote-admin.sql` no SQL Editor (service role), informando o e-mail. Nunca no frontend.

**Mercado Pago**: somente sandbox; `BILLING_ENABLED=false` impede qualquer cobrança. **DataJud**: sem `DATAJUD_API_URL`/`DATAJUD_API_KEY` a consulta fica "ainda não configurada"; nenhum dado é fabricado.

## Status e limitações reais
Não foi possível, neste ambiente, validar com credenciais reais: OTP por e-mail, Google OAuth, OpenAI, DataJud e Mercado Pago (sem acesso ao dashboard Supabase/chaves). Apenas testes unitários e build foram executados. Se algum fluxo real for bloqueado por configuração do Supabase, a recomendação é manter Supabase (RLS por workspace já implementada, menor custo/atrito) e corrigir a configuração; alternativas (Neon + Better Auth, Clerk, Convex) exigiriam reescrever RLS e storage. O acesso a dados fica concentrado em `src/lib/supabase/*` e `src/lib/runtime.ts`, facilitando uma eventual migração.
