import { requireUser } from "@/lib/auth";
import { isBillingEnabled } from "@/lib/env";
import { loadAccess, loadPublicSettings } from "@/lib/runtime";
import SubscribeButton from "./SubscribeButton";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STATUS: Record<string, string> = { authorized: "Ativa", pending: "Aguardando pagamento", paused: "Pausada", cancelled: "Cancelada" };

export default async function SubscriptionPage() {
  const { supabase, user } = await requireUser();
  const settings = await loadPublicSettings(supabase);
  const access = await loadAccess(supabase, user.id);
  const [{ data: sub }, { data: payments }] = await Promise.all([
    supabase.from("subscriptions").select("status,next_payment_date,environment").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("payments").select("mp_payment_id,amount,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(24),
  ]);

  const price = settings.plan.price_brl;
  const canSubscribe = isBillingEnabled() && settings.plan.available && !!price && access.kind !== "subscription";
  const situation =
    access.kind === "subscription"
      ? `Assinatura ativa${sub?.next_payment_date ? ` · próxima cobrança em ${new Date(sub.next_payment_date).toLocaleDateString("pt-BR")}` : ""}.`
      : access.kind === "trial"
        ? `Teste gratuito ativo até ${access.trialEndsAt.toLocaleDateString("pt-BR")}. Sem cartão e sem cobrança automática.`
        : `Seu teste gratuito terminou em ${access.trialEndsAt.toLocaleDateString("pt-BR")}. Assine para continuar usando os recursos de IA.`;
  const card: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 8 };

  return (
    <div style={{ padding: "32px 36px 40px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <div>
        <h1 className="h-page">Minha assinatura</h1>
        <p className="sub">Plano, pagamentos e cancelamento da sua conta.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, alignItems: "start" }}>
        <section style={{ ...card, gap: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: ".14em", color: "var(--bronze)", fontWeight: 600 }}>PLANO JUSLEGIS</div>
          <div className="serif" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>Assinatura mensal</div>
          <div style={{ fontSize: 14, color: "var(--muted-2)", lineHeight: 1.55 }}>
            Acesso ao Assistente IA, petições, análise de documentos, pesquisa, agenda e arquivos, conforme os recursos habilitados pelo administrador da plataforma.
          </div>
          <div style={{ fontSize: 13.5 }}>
            <b>Preço:</b> {price ? <span>{brl(price)} / mês</span> : <span style={{ color: "var(--muted)" }}>será exibido quando definido pelo administrador</span>}
          </div>
          <SubscribeButton disabled={!canSubscribe} />
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            {!isBillingEnabled()
              ? "O checkout seguro do Mercado Pago ainda não está habilitado. Nenhuma cobrança será feita."
              : !settings.plan.available
                ? "O plano ainda não está disponível para novas assinaturas."
                : "O pagamento é feito em checkout seguro do Mercado Pago. O acesso é liberado após a confirmação do pagamento."}
          </div>
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section style={card}>
            <h2 className="h-card">Situação</h2>
            <div style={{ fontSize: 13.5, color: "var(--muted-2)", lineHeight: 1.5 }}>{situation}</div>
            {sub && sub.status !== "authorized" && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Última assinatura: {STATUS[sub.status] ?? sub.status}</div>}
          </section>
          <section style={card}>
            <h2 className="h-card">Histórico de pagamentos</h2>
            {payments && payments.length ? (
              payments.map((p) => (
                <div key={p.mp_payment_id} className="row" style={{ fontSize: 13 }}>
                  <span style={{ flex: 1 }}>{new Date(p.created_at).toLocaleDateString("pt-BR")}</span>
                  <span>{p.amount != null ? brl(Number(p.amount)) : "—"}</span>
                  <span className="tag">{p.status}</span>
                </div>
              ))
            ) : (
              <div className="empty" style={{ padding: 18 }}>Nenhum pagamento registrado.</div>
            )}
          </section>
          <section style={{ ...card, gap: 10 }}>
            <h2 className="h-card">Cancelamento</h2>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              {access.kind === "subscription"
                ? "O cancelamento pela plataforma ainda depende de integração. Enquanto isso, cancele pela sua conta do Mercado Pago."
                : "Disponível quando houver uma assinatura ativa."}
            </div>
            <button disabled className="btn btn-outline" style={{ color: "var(--faint)", alignSelf: "flex-start", fontSize: 13, padding: "9px 16px" }}>
              Cancelar assinatura
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
