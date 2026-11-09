import { DataTable, ReadOnlyField, Section, Tabs, TestCard } from "@/components/admin/kit";
import { loadLastChecks, loadSettingsFor, loadSecretsPresent, statusLabel } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { isBillingEnabled, mpEnvironment } from "@/lib/env";
import SyncPlanButton from "./SyncPlanButton";
import ExportCsvButton from "@/components/admin/ExportCsvButton";

const TABS: [string, string][] = [["planos", "Plano e conta"], ["assinaturas", "Assinaturas"], ["cobrancas", "Cobranças"], ["webhooks", "Webhooks"], ["ambiente", "Ambiente"]];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

export default async function MercadoPagoPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "planos" } = await searchParams;
  const { supabase } = await requireAdmin();
  const sp = await loadSecretsPresent();
  const [s, checks] = await Promise.all([loadSettingsFor(supabase), loadLastChecks(supabase)]);
  const emailOf = async (ids: (string | null)[]) => {
    const list = [...new Set(ids.filter(Boolean))] as string[];
    if (!list.length) return {} as Record<string, string>;
    const { data } = await supabase.from("profiles").select("id,email").in("id", list);
    return Object.fromEntries((data ?? []).map((p) => [p.id, p.email]));
  };

  let body: React.ReactNode = null;
  if (tab === "planos") {
    body = (
      <>
        <Section title="Conta recebedora" desc="Todas as assinaturas são pagas à única conta empresarial PJ do proprietário. Clientes não configuram gateway, tokens ou webhooks.">
          <div className="grid-auto">
            <ReadOnlyField label="Conta recebedora" value={checks[mpEnvironment() === "prod" ? "mp_prod" : "mp_test"]?.ok ? "Conectada (último teste)" : "Não conectada ou não testada"} />
            <ReadOnlyField label="Cobranças (BILLING_ENABLED)" value={isBillingEnabled() ? "Habilitadas" : "Desabilitadas"} />
          </div>
        </Section>
        <Section title="Plano no Mercado Pago" desc="Plano padrão sincronizado com a API de Assinaturas. A sincronização cria o plano no Mercado Pago, mas não cobra ninguém.">
          <DataTable cols={["Plano", "Valor", "Periodicidade", "Disponível", "ID externo"]} rows={s.plan.mp_plan_id ? [["Assinatura mensal", s.plan.price_brl ? brl(s.plan.price_brl) : "—", "Mensal", s.plan.available ? "Sim" : "Não", s.plan.mp_plan_id]] : []} empty="Plano ainda não sincronizado." />
          <SyncPlanButton enabled={isBillingEnabled()} />
        </Section>
      </>
    );
  } else if (tab === "assinaturas") {
    const { data } = await supabase.from("subscriptions").select("user_id,status,next_payment_date,updated_at,environment").order("updated_at", { ascending: false }).limit(100);
    const emails = await emailOf((data ?? []).map((r) => r.user_id));
    body = (
      <Section title="Assinaturas" desc="Renovação, cancelamento e falhas de cobrança, conforme confirmado pelo webhook.">
        <DataTable cols={["E-mail", "Status", "Ambiente", "Próxima cobrança", "Atualizado"]} rows={(data ?? []).map((r) => [emails[r.user_id] ?? r.user_id, r.status, r.environment, when(r.next_payment_date), when(r.updated_at)])} empty="Nenhuma assinatura registrada." />
      </Section>
    );
  } else if (tab === "cobrancas") {
    const { data } = await supabase.from("payments").select("mp_payment_id,user_id,amount,status,environment,created_at").order("created_at", { ascending: false }).limit(100);
    const emails = await emailOf((data ?? []).map((r) => r.user_id));
    const rawRows = (data ?? []).map((r) => ({
      date: when(r.created_at),
      email: r.user_id ? emails[r.user_id] ?? "—" : "—",
      amount: r.amount != null ? brl(Number(r.amount)) : "—",
      status: r.status,
      paymentId: r.mp_payment_id,
    }));
    body = (
      <Section title="Cobranças" desc="Status confirmado pelo servidor junto ao Mercado Pago.">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <ExportCsvButton
            filename="juslegis-cobrancas-mp"
            headers={["Data", "E-mail", "Valor", "Status", "ID do pagamento"]}
            rows={rawRows.map((r) => [r.date, r.email, r.amount, r.status, r.paymentId])}
          />
        </div>
        <DataTable
          cols={["Data", "E-mail", "Valor", "Status", "ID do pagamento"]}
          rows={rawRows.map((r) => [r.date, r.email, r.amount, r.status, r.paymentId])}
          empty="Nenhuma cobrança registrada."
        />
      </Section>
    );
  } else if (tab === "webhooks") {
    const { data } = await supabase.from("webhook_events").select("type,event_key,result,signature_valid,created_at").order("created_at", { ascending: false }).limit(50);
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    body = (
      <>
        <Section title="Endpoint de webhooks" desc="Cadastre esta URL no painel de Webhooks do Mercado Pago (eventos: pagamentos e assinaturas).">
          <div className="grid-auto">
            <ReadOnlyField label="URL do endpoint" value={site ? `${site.replace(/\/$/, "")}/api/webhooks/mercadopago` : "Defina NEXT_PUBLIC_SITE_URL"} />
            <ReadOnlyField label="Segredo de assinatura" value={sp.mpWebhook ? "Definido no servidor — não exibido" : "Não definido — informe em Integrações e APIs"} />
          </div>
        </Section>
        <Section title="Regras de segurança" desc="Aplicadas pelo código; não podem ser desativadas.">
          {["Validar a assinatura de cada evento no servidor", "Ignorar eventos duplicados (idempotência)", "Confirmar o pagamento consultando a API antes de liberar acesso", "Registrar todos os eventos aceitos"].map((l) => (
            <div key={l} className="row" style={{ fontSize: 13.5 }}><span style={{ flex: 1 }}>{l}</span><span className="tag tag-ok">Obrigatória</span></div>
          ))}
        </Section>
        <Section title="Histórico de eventos">
          <DataTable cols={["Data", "Tipo", "ID do evento", "Resultado"]} rows={(data ?? []).map((r) => [when(r.created_at), r.type ?? "—", r.event_key, r.result ?? "—"])} empty="Nenhum evento recebido." />
        </Section>
      </>
    );
  } else {
    body = (
      <Section title="Ambientes" desc="Inicie em teste; produção só após validar o fluxo completo. O ambiente ativo é definido por MP_ENVIRONMENT na Vercel." tag={mpEnvironment() === "prod" ? "PRODUÇÃO" : "TESTE"}>
        <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
          <TestCard service="mp_test" name="Teste" desc="Credenciais de sandbox." status={statusLabel(checks.mp_test, sp.mpTest)} initial={checks.mp_test ?? null} />
          <TestCard service="mp_prod" name="Produção" desc="Credenciais reais. O teste só consulta a conta; nada é cobrado." status={statusLabel(checks.mp_prod, sp.mpProd)} initial={checks.mp_prod ?? null} />
        </div>
      </Section>
    );
  }

  return (
    <>
      <div>
        <h1 className="h-page">Mercado Pago</h1>
        <p className="sub">Assinaturas mensais. O acesso só é liberado após a confirmação do pagamento no servidor. Nenhuma transação é simulada.</p>
      </div>
      <Tabs base="/admin/mercado-pago" current={tab} tabs={TABS} />
      {body}
    </>
  );
}
