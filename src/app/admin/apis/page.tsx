import { ReadOnlyField, SecretRows, Section, TestButton, TestCard, Tabs } from "@/components/admin/kit";
import { loadLastChecks, loadSettingsFor, secretsPresent, statusLabel } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { isBillingEnabled, mpEnvironment } from "@/lib/env";
import LegalForm from "./LegalForm";

const TABS: [string, string][] = [["", "Visão geral"], ["openai", "OpenAI"], ["mp", "Mercado Pago"], ["mcp", "Mercado Pago MCP"], ["sb", "Supabase"], ["jur", "APIs jurídicas"]];

export default async function ApisPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "" } = await searchParams;
  const { supabase } = await requireAdmin();
  const [checks, s] = await Promise.all([loadLastChecks(supabase), loadSettingsFor(supabase)]);
  const b = isBillingEnabled();

  return (
    <>
      <div>
        <h1 className="h-page">Integrações e APIs</h1>
        <p className="sub">Painel exclusivo do Administrador Geral. Credenciais ficam em variáveis secretas da Vercel, lidas só pelo backend; aqui aparecem apenas estado e testes reais de conexão.</p>
      </div>
      <Tabs base="/admin/apis" current={tab} tabs={TABS} />

      {tab === "" && (
        <Section>
          <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
            <TestCard service="openai" name="OpenAI" desc="Modelos de linguagem do assistente e das minutas." status={statusLabel(checks.openai, secretsPresent.openai())} initial={checks.openai ?? null} configureHref="/admin/apis?tab=openai" />
            <TestCard service="mp_test" name="Mercado Pago (teste)" desc="Conta recebedora PJ em sandbox." status={statusLabel(checks.mp_test, secretsPresent.mpTest())} initial={checks.mp_test ?? null} configureHref="/admin/apis?tab=mp" />
            <TestCard service="mp_prod" name="Mercado Pago (produção)" desc="Credenciais reais. Teste apenas verifica a conta; não cobra." status={statusLabel(checks.mp_prod, secretsPresent.mpProd())} initial={checks.mp_prod ?? null} configureHref="/admin/apis?tab=mp" />
            <TestCard service="mcp" name="Mercado Pago MCP" desc="Ferramentas de desenvolvimento, separadas da API de pagamentos." status="Não conectado" initial={null} noTest configureHref="/admin/apis?tab=mcp" />
            <TestCard service="supabase" name="Supabase" desc="Autenticação, banco PostgreSQL e arquivos privados." status={statusLabel(checks.supabase, secretsPresent.serviceRole())} initial={checks.supabase ?? null} configureHref="/admin/apis?tab=sb" />
            <TestCard service="legal" name="APIs jurídicas" desc="Fornecedor futuro de legislação, jurisprudência e processos." status={s.legal.provider ? "Fornecedor selecionado · não integrado" : "Nenhum fornecedor"} initial={checks.legal ?? null} configureHref="/admin/apis?tab=jur" />
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
          <SecretRows rows={[{ name: "OPENAI_API_KEY", kind: "Secreta", defined: secretsPresent.openai() }]} />
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
          <SecretRows rows={[{ name: "MP_ACCESS_TOKEN_TEST", kind: "Secreta · teste", defined: secretsPresent.mpTest() }, { name: "MP_ACCESS_TOKEN_PROD", kind: "Secreta · produção", defined: secretsPresent.mpProd() }, { name: "MP_WEBHOOK_SECRET", kind: "Secreta", defined: secretsPresent.mpWebhook() }]} />
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
          <SecretRows rows={[{ name: "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY", kind: "Pública", defined: secretsPresent.supabaseUrl() }, { name: "SUPABASE_SERVICE_ROLE_KEY", kind: "Secreta", defined: secretsPresent.serviceRole() }]} />
        </>
      )}

      {tab === "jur" && (
        <>
          <LegalForm initial={s.legal} />
          <Section>
            <TestButton service="legal" initial={checks.legal ?? null} />
          </Section>
          <SecretRows rows={[{ name: "LEGAL_DATA_API_KEY", kind: "Secreta", defined: secretsPresent.legal() }]} />
        </>
      )}
    </>
  );
}
