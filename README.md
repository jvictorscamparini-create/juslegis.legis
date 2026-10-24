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

1. Crie/configure o projeto Supabase e aplique, em ordem, as migrações de `supabase/migrations/`. Habilite Google e e-mail com código (OTP) em Authentication e adicione `<SITE_URL>/auth/callback` nas Redirect URLs.
2. Cadastre na Vercel as variáveis necessárias listadas abaixo. `NEXT_PUBLIC_SITE_URL` deve ser a URL HTTPS canônica do deployment.
3. Faça o primeiro login com a conta proprietária e execute `supabase/promote-admin.sql` com o e-mail correto para promovê-la a Administrador Geral.
4. Em `/admin/apis`, teste a Responses API e a pesquisa oficial. Esses testes fazem chamadas reais à OpenAI e podem gerar uso faturável.
5. Em `/admin/ia`, selecione um modelo permitido pela conta OpenAI. Fontes jurídicas iniciam desabilitadas; habilite apenas as categorias oficiais que pretende oferecer.

O teste é de 72 horas por padrão e começa na primeira ativação autenticada do workspace. A migração `20261023020000_trial_activation.sql` registra uma única ativação e congela a duração por usuário; contas já existentes são migradas com o período calculado pela configuração vigente, para preservar o acesso atual. Se o RPC dessa migração não estiver instalado, o acesso ao teste falha fechado.

**Não configure cobranças reais nesta etapa.** Mantenha `BILLING_ENABLED=false`; Mercado Pago, checkout e webhooks são etapas posteriores. A Vercel não executa migrações remotas automaticamente.

### Variáveis da Vercel

Necessárias para autenticação e funcionamento do servidor:

- `NEXT_PUBLIC_SITE_URL`: URL pública HTTPS do app.
- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: URL e chave pública/anon do projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta usada apenas no servidor; nunca use o prefixo `NEXT_PUBLIC_`.

Necessária para IA e pesquisa jurídica oficial (opcional para compilar/deploy):

- `OPENAI_API_KEY`: chave de API mantida como segredo; selecione o modelo no Admin Geral.

Mercado Pago fica fora do escopo desta etapa. Se as variáveis desse provedor forem cadastradas para testes futuros, mantenha `MP_ENVIRONMENT=test` e `BILLING_ENABLED=false`. Não é necessária uma chave jurídica separada: a pesquisa usa a ferramenta web da OpenAI e só acontece quando o Admin Geral habilita fontes oficiais. Não há consulta de jurisprudência fora dos domínios configurados, doutrina ou consulta processual.

## Segurança

- Autorização de admin: `requireAdmin()` em `src/app/admin/layout.tsx` + `apiRequireAdmin()` em toda API admin + RLS (`is_admin()`) no banco. `proxy.ts` é só checagem otimista.
- Papel e situação do usuário não são graváveis pelo próprio usuário (grant de coluna só em `full_name`).
- Chaves OpenAI/Mercado Pago/service role só existem no servidor (`server-only`); a tela admin mostra apenas "definida / não definida".
- Dados dos advogados: RLS por `user_id`; arquivos em bucket privado `user-files/<user_id>/`.
- Webhook: assinatura validada, idempotência por evento, status reconsultado na API do Mercado Pago antes de liberar acesso.
- Pesquisa legal: busca OpenAI limitada a domínios oficiais; URLs precisam responder por HTTPS e permanecer em domínio autorizado, referências são armazenadas em tabela sem permissão de escrita pelo usuário. A validação técnica do link não substitui a conferência da vigência ou interpretação jurídica pelo advogado.

## Etapas ainda pendentes

- **Mercado Pago PJ:** plano mensal, checkout, verificação/cancelamento e webhooks devem ser integrados e testados em sandbox antes de qualquer ativação.
- **Fontes jurídicas adicionais:** ampliar fontes jurisprudenciais mediante verificação das APIs, licenças e termos aplicáveis. Doutrina e consulta processual continuam indisponíveis; nenhum processo é consultado ou simulado.
- **Admin Geral:** configuração de modelo, prompts, limites, fontes e funcionalidades já existe; monitoramento/custos e demais módulos ainda precisam de implementação específica.

## Scripts

`npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
(em máquinas com pouca RAM: `SKIP_NEXT_TYPECHECK=1 npm run build` após rodar o typecheck)
