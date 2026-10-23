"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmModal } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";

export default function SyncPlanButton({ enabled }: { enabled: boolean }) {
  const say = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    const res = await fetch("/api/admin/billing/sync-plan", { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setOpen(false);
    say(res?.ok ? "Plano sincronizado com o Mercado Pago." : data.error ?? "Falha na sincronização.");
    if (res?.ok) router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn btn-dark" disabled={!enabled} onClick={() => setOpen(true)} style={{ fontSize: 13, padding: "9px 16px", borderRadius: 9 }}>
        Sincronizar plano
      </button>
      {!enabled && <span style={{ fontSize: 12.5, color: "var(--red)" }}>Bloqueado: BILLING_ENABLED não é &quot;true&quot; no servidor.</span>}
      {open && <ConfirmModal busy={busy} message="Isto cria ou atualiza o plano mensal no Mercado Pago no ambiente ativo. Nenhum usuário é cobrado por esta ação." onCancel={() => setOpen(false)} onConfirm={sync} />}
    </div>
  );
}
