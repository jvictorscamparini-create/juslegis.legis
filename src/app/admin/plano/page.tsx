import { Tabs } from "@/components/admin/kit";
import { loadSettingsFor } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { PlanForm, TrialForm } from "./forms";

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "planos" } = await searchParams;
  const { supabase } = await requireAdmin();
  const s = await loadSettingsFor(supabase);
  return (
    <>
      <div>
        <h1 className="h-page">{tab === "trial" ? "Teste gratuito" : "Plano padrão"}</h1>
        <p className="sub">Único plano comercial da JusLegis. O advogado apenas assina e usa; valor, limites e recursos são definidos aqui e verificados no servidor.</p>
      </div>
      <Tabs base="/admin/plano" current={tab} tabs={[["planos", "Plano padrão"], ["trial", "Teste gratuito"]]} />
      {tab === "trial" ? <TrialForm initial={s.trial} /> : <PlanForm initial={s.plan} />}
    </>
  );
}
