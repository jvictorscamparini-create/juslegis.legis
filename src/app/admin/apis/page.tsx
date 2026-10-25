import { ReadOnlyField, SecretEditor, SecretRows, Section, TestButton, TestCard, Tabs } from "@/components/admin/kit";
import { loadLastChecks, loadSettingsFor, loadSecretsPresent, statusLabel } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { isBillingEnabled, mpEnvironment } from "@/lib/env";
import { canStoreSecrets, secretStatuses } from "@/lib/secrets";
import LegalForm from "./LegalForm";

const TABS: [string, string][] = [["", "Visão geral"], ["openai", "OpenAI"], ["mp", "Mercado Pago"], ["mcp", "Mercado Pago MCP"], ["sb", "Supabase"], ["jur", "APIs jurídicas"]];

export default async function ApisPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "" } = await searchParams;
  const { supabase } = await requireAdmin();
  const sp = await loadSecretsPresent();
  const [checks, s] = await Promise.all([loadLastChecks(supabase), loadSettingsFor(supabase)]);
  const b = isBillingEnabled();
  const st = await secretStatuses();
  const canStore = canStoreSecrets();

  return (
    <>
      <div>
        <h1 className="h-page">Integrações e APIs</h1>
        <p className="sub">Painel exclusivo do Administrador Geral. As chaves são informadas aqui, cifradas no servidor e lidas só pelo backend; depois de salvas nunca são exibidas. Variáveis da Vercel continuam valendo como alternativa.</p>
      </div>
      <Tabs base="/admin/apis" current={tab} tabs={TABS} />

      {tab === "" && (
        <Section>
          <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
            <TestCard service="openai" name="OpenAI" desc="Modelos de linguagem do assistente e das minutas." status={statusLabel(checks.openai, sp.openai)} initial={checks.openai ?? null} configureHref="/admin/apis?tab=openai" />
            <TestCard service="mp_test" name="Mercado Pago (teste)" desc="Conta recebedora PJ em sandbox." status={statusLabel(checks.mp_test, sp.mpTest)} initial={checks.mp_test ?? null} configureHref="/admin/apis?tab=mp" />
            <TestCard service="mp_prod" name="Mercado Pago (produção)" desc="Credenciais reais. Teste apenas verifica a conta; não cobra." status={statusLabel(checks.mp_prod, sp.mpProd)} initial={checks.mp_prod ?? null} configureHref="/admin/apis?tab=mp" />
            <TestCard service="mcp" name="Mercado Pago MCP" desc="Ferramentas de desenvolvimento, separadas da API de pagamentos." status="Não conectado" initial={null} noTest configureHref="/admin/apis?tab=mcp" />
            <TestCard service="supabase" name="Supabase" desc="Autenticação, banco PostgreSQL e arquivos privados." status={statusLabel(checks.supabase, sp.serviceRole)} initial={checks.supabase ?? null} configureHref="/admin/apis?tab=sb" />
            <TestCard service="legal" name="Fontes jurídicas oficiais" desc="Pesquisa via OpenAI, restrita a domínios oficiais de legislação e tribunais." status={statusLabel(checks.legal, sp.legal)} initial={checks.legal ?? null} configureHref="/admin/apis?tab=jur" />
          </div>
        </Section>
      )}

      {tab === "openai" && (
        <>
          <Section title="Configuração operacional" desc="Modelo, limites e custos são editados em Modelos de IA.">
            <div className="grid-auto">
              <ReadOnlyField label="Provedor" value="OpenAI (único fornecedor inicial)" />
              <ReadOnlyField label="Modelo ativo" value={s.ai_model.model || "Nenhum modelo selecionado"} />
              <ReadOnlyField label="Limite de custo mensal" value={s.ai_limits.cost_month_brl != null ? `R$ ${s.ai_limits.cost_month_brl}` : "Não definido"} />
            </div>
            <TestButton service="openai" initial={checks.openai ?? null} />
          </Section>
          <SecretEditor canStore={canStore} rows={[{ label: "Chave da API OpenAI", kind: "Secreta", ...st.OPENAI_API_KEY }]} />
        </>
      )}

      {tab === "mp" && (
        <>
          <Section title="Configuração operacional" desc="Todos os pagamentos vão para a única conta empresarial PJ do proprietário. Assinantes não configuram gateway.">
            <div className="grid-auto">
              <ReadOnlyField label="Ambiente ativo (MP_ENVIRONMENT)" value={mpEnvironment() === "prod" ? "Produção" : "Teste"} />
              <ReadOnlyField label="Cobranças (BILLING_ENABLED)" value={b ? "Habilitadas" : "Desabilitadas — nenhum checkout é criado"} />
              <ReadOnlyField label="Plano mensal padrão" value={s.plan.mp_plan_id ? `Sincronizado (${s.plan.mp_plan_id})` : "Não sincronizado"} />
            </div>
            <TestButton service="mp_test" label="Testar conexão (teste)" initial={checks.mp_test ?? null} />
            <TestButton service="mp_prod" label="Testar conexão (produção)" initial={checks.mp_prod ?? null} />
          </Section>
          <SecretEditor canStore={canStore} rows={[{ label: "Access token (teste)", kind: "Secreta · sandbox", ...st.MP_ACCESS_TOKEN_TEST }, { label: "Access token (produção)", kind: "Secreta · produção", hint: "Só será usado quando o ambiente de produção e BILLING_ENABLED forem liberados.", ...st.MP_ACCESS_TOKEN_PROD }, { label: "Segredo de assinatura do webhook", kind: "Secreta", ...st.MP_WEBHOOK_SECRET }]} />
        </>
      )}

      {tab === "mcp" && (
        <Section title="Mercado Pago MCP" desc="Ferramentas de desenvolvimento (documentação e apoio a testes). Independente da API de pagamentos; não é usado em produção nem pelos assinantes." tag="Desenvolvimento">
          <div className="grid-auto">
            <ReadOnlyField label="Forma de conexão" value="OAuth oficial, autorizado no Claude Code" />
            <ReadOnlyField label="Estado" value="Não conectado" />
          </div>
          <div className="empty">Nenhuma credencial é guardada aqui: a conexão por OAuth é gerenciada pelo Claude Code.</div>
        </Section>
      )}

      {tab === "sb" && (
        <>
          <Section title="Configuração operacional" desc="Isolamento por RLS obrigatório nas tabelas de dados dos advogados.">
            <TestButton service="supabase" initial={checks.supabase ?? null} />
          </Section>
          <SecretRows rows={[{ name: "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY", kind: "Pública", defined: sp.supabaseUrl }, { name: "SUPABASE_SERVICE_ROLE_KEY", kind: "Secreta", defined: sp.serviceRole }]} />
        </>
      )}

      {tab === "jur" && (
        <>
          <LegalForm initial={s.legal} />
          <Section>
            <TestButton service="legal" initial={checks.legal ?? null} />
          </Section>
        </>
      )}
    </>
  );
}
