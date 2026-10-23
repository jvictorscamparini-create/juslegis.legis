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

## Executar localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev
```

Sem variáveis o app sobe, mas o login informa "não configurado" e nenhuma integração responde (por design).

## Colocar no ar (passos manuais)

1. **Supabase**: crie o projeto, aplique `supabase/migrations/20261023000000_init.sql` (SQL Editor ou `supabase db push`), habilite o provedor Google e o e-mail com código (OTP) em Authentication, e adicione `<SITE_URL>/auth/callback` nas Redirect URLs.
2. Faça o primeiro login com a conta do proprietário e execute `supabase/promote-admin.sql` (com o e-mail dele) para virar Administrador Geral.
3. **Vercel**: importe o repositório do GitHub e defina as variáveis de `.env.example`. Mantenha `MP_ENVIRONMENT=test` e `BILLING_ENABLED=false` até validar tudo.
4. Em `/admin/apis` rode cada **Testar conexão** (chamadas reais; só aparece "Conectada" se o serviço respondeu).
5. Em `/admin/ia` escolha o modelo OpenAI autorizado; em `/admin/plano` defina valor e disponibilidade.
6. **Mercado Pago**: cadastre `<SITE_URL>/api/webhooks/mercadopago` e copie o segredo para `MP_WEBHOOK_SECRET`. Só depois, com autorização do proprietário, mude `BILLING_ENABLED=true`.

## Segurança

- Autorização de admin: `requireAdmin()` em `src/app/admin/layout.tsx` + `apiRequireAdmin()` em toda API admin + RLS (`is_admin()`) no banco. `proxy.ts` é só checagem otimista.
- Papel e situação do usuário não são graváveis pelo próprio usuário (grant de coluna só em `full_name`).
- Chaves OpenAI/Mercado Pago/service role só existem no servidor (`server-only`); a tela admin mostra apenas "definida / não definida".
- Dados dos advogados: RLS por `user_id`; arquivos em bucket privado `user-files/<user_id>/`.
- Webhook: assinatura validada, idempotência por evento, status reconsultado na API do Mercado Pago antes de liberar acesso.

## Scripts

`npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
(em máquinas com pouca RAM: `SKIP_NEXT_TYPECHECK=1 npm run build` após rodar o typecheck)
