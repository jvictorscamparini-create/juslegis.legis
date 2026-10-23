import Link from "next/link";
import { Icon } from "@/components/icons";
import { QuickAction, SoonButton } from "@/components/workspace/QuickAction";
import { requireUser } from "@/lib/auth";
import { isAiReady } from "@/lib/runtime";

export default async function Overview() {
  const { supabase } = await requireUser();
  const aiReady = await isAiReady();
  const { data: petitions } = await supabase
    .from("petitions")
    .select("id,title,form,updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);

  const emptyPanel = (icon: React.ComponentProps<typeof Icon>["name"], text: string, action: React.ReactNode) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, border: "1px dashed var(--chip)", borderRadius: 14, padding: "22px 16px" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#F6EFE6", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={20} color="#795A38" />
      </div>
      <div style={{ fontSize: 14, color: "var(--muted-2)", lineHeight: 1.45 }}>{text}</div>
      {action}
    </div>
  );
  const panelStyle: React.CSSProperties = { background: "#fff", borderRadius: 20, padding: 22, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 16, minHeight: 250 };

  return (
    <div style={{ padding: "32px 36px 40px", display: "flex", flexDirection: "column", gap: 32, maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <section style={{ position: "relative", borderRadius: 22, overflow: "hidden", background: "var(--ink)", color: "#fff", minHeight: 200, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,#1E1B17 0 14px,#25211B 14px 28px)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,rgba(23,25,28,.95) 25%,rgba(23,25,28,.2) 80%)" }} />
        <div style={{ position: "relative", padding: "34px 40px", maxWidth: 560 }}>
          <h1 className="serif" style={{ margin: 0, fontWeight: 500, fontSize: "clamp(36px,5vw,54px)", lineHeight: 1.02 }}>
            Seu escritório mais produtivo.
          </h1>
          <p style={{ margin: "14px 0 0", fontSize: 16, lineHeight: 1.5, color: "#E9E4DA" }}>
            Inteligência jurídica, pesquisa e elaboração de peças em uma única plataforma.
          </p>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 12, letterSpacing: ".14em", color: "var(--muted)", fontWeight: 600 }}>AÇÕES RÁPIDAS</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 }}>
          <QuickAction title="Assistente IA" text="Converse, pesquise fundamentos e organize casos." icon="spark" tone="e" href="/app/assistente" tag={aiReady ? undefined : "IA não conectada"} />
          <QuickAction title="Criar Petição" text="Elabore a minuta no editor e revise antes de exportar." icon="pen" tone="b" href="/app/peticoes" />
          <QuickAction title="Analisar Documento" text="Envie PDF ao assistente para resumo e pontos de atenção." icon="fsearch" tone="g" href="/app/assistente" tag={aiReady ? undefined : "IA não conectada"} />
          <QuickAction title="Consultar Processo" text="Busca por número CNJ em fonte autorizada." icon="search" tone="r" soon="Consulta Processual" tag="Fonte não configurada" />
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 16, alignItems: "stretch" }}>
        <section style={panelStyle}>
          <h2 className="serif" style={{ margin: 0, fontSize: 25, fontWeight: 600 }}>
            Trabalhos recentes
          </h2>
          {petitions && petitions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {petitions.map((p) => (
                <Link key={p.id} href={`/app/peticoes?id=${p.id}`} className="row" style={{ color: "var(--ink)" }}>
                  <Icon name="pen" size={16} color="#795A38" />
                  <span style={{ flex: 1, fontWeight: 500 }}>{(p.form as { tipo?: string })?.tipo || p.title}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(p.updated_at).toLocaleDateString("pt-BR")}</span>
                </Link>
              ))}
            </div>
          ) : (
            emptyPanel("pen", "Nenhuma petição criada. Nenhuma atividade recente.", (
              <Link href="/app/peticoes" className="btn btn-dark" style={{ fontSize: 13, padding: "10px 16px" }}>
                Criar petição
              </Link>
            ))
          )}
        </section>
        <section style={panelStyle}>
          <h2 className="serif" style={{ margin: 0, fontSize: 25, fontWeight: 600 }}>
            Próximos compromissos
          </h2>
          {emptyPanel("cal", "Nenhum compromisso registrado.", <SoonButton label="Registrar compromisso" module="Agenda e Prazos" />)}
        </section>
        <section style={panelStyle}>
          <h2 className="serif" style={{ margin: 0, fontSize: 25, fontWeight: 600 }}>
            Meus processos
          </h2>
          {emptyPanel("scale", "Nenhum processo cadastrado.", <SoonButton label="Cadastrar processo" module="Meus Processos" />)}
        </section>
      </div>
    </div>
  );
}
