import { Section, Tabs, DataTable } from "@/components/admin/kit";
import { loadLastChecks, loadSettingsFor } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { ModelForm, LimitsForm, FeaturesForm, PromptForm } from "./forms";

const TABS: [string, string][] = [["modelo", "Modelo e parâmetros"], ["limites", "Limites"], ["recursos", "Recursos"], ["prompts", "Prompts"]];

export default async function IaPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "modelo" } = await searchParams;
  const { supabase } = await requireAdmin();
  const [s, checks] = await Promise.all([loadSettingsFor(supabase), loadLastChecks(supabase)]);
  const { data: prompts } = await supabase.from("ai_prompts").select("id,name,version,active,created_at").order("created_at", { ascending: false });
  const title = tab === "prompts" ? "Prompts" : tab === "recursos" ? "Funcionalidades" : "Modelos de IA";

  return (
    <>
      <div>
        <h1 className="h-page">{title}</h1>
        <p className="sub">Configuração central da IA, aplicada a todos os assinantes. Trocar fornecedor ou modelo não exige nenhuma ação deles. Alterações são validadas e registradas pelo servidor.</p>
      </div>
      <Tabs base="/admin/ia" current={tab} tabs={TABS} />
      {tab === "modelo" && <ModelForm initial={s.ai_model} check={checks.openai ?? null} />}
      {tab === "limites" && <LimitsForm initial={s.ai_limits} />}
      {tab === "recursos" && <FeaturesForm initial={s.features} />}
      {tab === "prompts" && (
        <>
          <PromptForm />
          <Section title="Prompts de sistema versionados" desc="Cada alteração gera uma nova versão com registro no log. O prompt ativo substitui a instrução padrão da IA.">
            <DataTable
              cols={["Nome", "Versão", "Estado", "Criado em"]}
              rows={(prompts ?? []).map((p) => [p.name, `v${p.version}`, p.active ? <span key="a" className="tag tag-ok">Ativo</span> : "Inativo", new Date(p.created_at).toLocaleString("pt-BR")])}
              empty="Nenhum prompt criado. A instrução padrão da JusLegis está em uso."
            />
          </Section>
        </>
      )}
    </>
  );
}
