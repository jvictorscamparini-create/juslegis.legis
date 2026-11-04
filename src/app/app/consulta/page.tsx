import { requireUser } from "@/lib/auth";
import { loadAccess, loadAllSettings, countProcessLookupsToday } from "@/lib/runtime";
import { processLookupBlocked } from "@/lib/process-lookup-rules";
import ProcessLookupForm from "./ProcessLookupForm";

export default async function ProcessLookupPage() {
  const { supabase, user } = await requireUser();
  const [settings, access, usedToday] = await Promise.all([loadAllSettings(), loadAccess(supabase, user.id), countProcessLookupsToday(user.id)]);

  return (
    <div style={{ padding: "32px clamp(16px,4vw,36px) 40px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <div>
        <h1 className="h-page">Consulta Processual</h1>
        <p className="sub">Consulta pelo número CNJ em fornecedor autorizado. O resultado aparece só para você e não fica salvo.</p>
      </div>
      <ProcessLookupForm unavailable={settings ? processLookupBlocked({ settings, access, usedToday }) : "A consulta está indisponível no momento."} />
    </div>
  );
}
