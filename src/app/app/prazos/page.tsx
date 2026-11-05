import { requireUser } from "@/lib/auth";
import PrazosClient, { type DeadlineRow } from "./PrazosClient";

export const metadata = { title: "Agenda e Prazos — JusLegis" };

export default async function PrazosPage() {
  const { supabase } = await requireUser();
  const [{ data: deadlines, error }, { data: cases }] = await Promise.all([
    supabase
      .from("deadlines")
      .select("id,title,case_id,start_date,days,counting,doubled,due_date,status,notes")
      .order("status", { ascending: false })
      .order("due_date", { ascending: true })
      .limit(500),
    supabase.from("cases").select("id,name").order("name").limit(500),
  ]);

  return (
    <div style={{ padding: "32px 36px 40px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <div>
        <h1 className="h-page">Agenda e Prazos</h1>
        <p className="sub">Calcule prazos processuais em dias úteis e acompanhe os vencimentos.</p>
      </div>
      <PrazosClient
        deadlines={(deadlines ?? []) as DeadlineRow[]}
        cases={(cases ?? []) as { id: string; name: string }[]}
        storageReady={!error}
      />
    </div>
  );
}
