import { requireUser } from "@/lib/auth";
import { loadAccess, loadPublicSettings, loadUsage } from "@/lib/runtime";

const n = (v: number) => v.toLocaleString("pt-BR");

export default async function UsagePage() {
  const { supabase, user } = await requireUser();
  const settings = await loadPublicSettings(supabase);
  const [access, usage] = await Promise.all([
    loadAccess(supabase, user.id),
    loadUsage(supabase, user.id),
  ]);
  const t = settings.trial;
  const rows: [string, string][] = [
    ["Tokens hoje", n(usage.tokensToday)],
    ["Tokens no mês", n(usage.tokensMonth)],
    ["Solicitações de IA (total)", n(usage.aiRequestsTotal) + (access.kind === "trial" && t.ai_requests ? ` de ${n(t.ai_requests)} no teste` : "")],
    ["Minutas geradas", n(usage.petitionsGenerated) + (access.kind === "trial" && t.petitions ? ` de ${n(t.petitions)} no teste` : "")],
    ["Análises de documentos", n(usage.documentsAnalyzed) + (access.kind === "trial" && t.documents ? ` de ${n(t.documents)} no teste` : "")],
  ];

  return (
    <div style={{ padding: "32px 36px 40px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <div>
        <h1 className="h-page">Meu consumo</h1>
        <p className="sub">Uso dos recursos da sua assinatura.</p>
      </div>
      <section style={{ background: "#fff", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-card)", maxWidth: 640 }}>
        {usage.aiRequestsTotal === 0 ? (
          <div className="empty" style={{ padding: 28 }}>
            Dados ainda não disponíveis.
            <br />O consumo aparecerá aqui após o uso das ferramentas.
          </div>
        ) : (
          rows.map(([l, v], i) => (
            <div key={l} className="row" style={{ borderTop: i ? undefined : 0 }}>
              <span style={{ flex: 1, color: "var(--muted)" }}>{l}</span>
              <b style={{ fontWeight: 600 }}>{v}</b>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
