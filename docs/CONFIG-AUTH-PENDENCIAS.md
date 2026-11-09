# JusLegis: autenticação, configuração externa pendente

Projeto Supabase: `hbqlwwnnbvritknwwzos` (https://hbqlwwnnbvritknwwzos.supabase.co). Não criar outro projeto.
Situação verificada em 09/11/2026 pelo endpoint público `/auth/v1/settings`: e-mail **ligado**, Google **desligado**,
cadastro aberto, confirmação de e-mail **obrigatória** (`mailer_autoconfirm=false`).

## 1. Supabase → Authentication → URL Configuration

Painel: https://supabase.com/dashboard/project/hbqlwwnnbvritknwwzos/auth/url-configuration

- **Site URL**: `https://juslegis.vercel.app` (endereço público atual; trocar só quando o domínio definitivo for promovido).
- **Redirect URLs** (adicionar todos):
  - `https://juslegis.vercel.app/auth/callback**`
  - `https://juslegis-*-jvictorscamparini-9868s-projects.vercel.app/auth/callback**` (Previews da Vercel)
  - `http://localhost:3000/auth/callback**`
  - `https://ais-dev-trzrt6fqt6r6p4kw7ge5ca-11456040753.us-east5.run.app/auth/callback**` (prévia do AI Studio; troque se o host mudar)

Sem isso, links de confirmação, código por e-mail, recuperação de senha e Google voltam para a Site URL em vez do ambiente em teste.

## 2. Google OAuth (opcional; hoje desligado)

1. Google Cloud Console → APIs e serviços → Credenciais → Criar credencial → ID do cliente OAuth → Aplicativo da Web.
   - **Origens JavaScript autorizadas**: `https://juslegis.vercel.app`
   - **URIs de redirecionamento autorizados**: `https://hbqlwwnnbvritknwwzos.supabase.co/auth/v1/callback`
   - Tela de consentimento: tipo Externo, domínio `juslegis.vercel.app`, e-mail de suporte do proprietário.
2. Supabase → Authentication → Sign In / Providers → **Google**: ativar e colar **Client ID** e **Client Secret**.
   https://supabase.com/dashboard/project/hbqlwwnnbvritknwwzos/auth/providers

Enquanto estiver desligado, o botão "Continuar com Google" explica isso e indica o login por e-mail. Não há login simulado.

## 3. Segurança recomendada

- Supabase → Authentication → **Leaked password protection**: ativar (aviso do Security Advisor).
- **Trocar a chave secreta exposta**: uma chave `service_role`/`sb_secret_` foi colada no histórico do AI Studio e está em
  arquivos `.env` de exportações locais. Em Supabase → Project Settings → API Keys, gere uma nova chave secreta,
  atualize-a na Vercel (`SUPABASE_SERVICE_ROLE_KEY`, Preview e Production, tipo Sensitive) e no AI Studio (Secrets), e
  só então revogue a antiga. Apague os `.env` das pastas exportadas na Área de Trabalho.

## 4. Variáveis por ambiente (nomes usados no código)

| Variável | Onde | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | todos | URL do projeto acima |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | todos | chave pública; é a usada no login |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | só para tarefas administrativas/webhooks, nunca para sessão de usuário. Na Vercel Preview hoje existe apenas para o branch `feat/cloudflare` |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | Production | `https://juslegis.vercel.app`. Em Preview fica vazio de propósito (usa `VERCEL_URL`) |
| `BILLING_ENABLED` | todos | manter `false` |
| `MERCADO_PAGO_ENVIRONMENT` | todos | manter `sandbox` |
| `APP_SECRETS_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATAJUD_API_URL`, `DATAJUD_API_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` | servidor | integrações; o painel Admin informa o que falta |
| `DEV_ALLOWED_ORIGINS` | só `next dev` | hosts extras da prévia (ex.: novo host do AI Studio), separados por vírgula |

## 5. AI Studio

- Apague o arquivo `middleware.ts` da raiz: no Next 16 a convenção é `src/proxy.ts` (já existe) e o arquivo da raiz era ignorado.
- Se o host da prévia mudar, adicione-o em `DEV_ALLOWED_ORIGINS` (Secrets do AI Studio) ou em `next.config.ts`.
