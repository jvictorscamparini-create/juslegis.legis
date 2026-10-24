"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toast";

export default function CancelSubscriptionButton({ available }: { available: boolean }) {
  const router = useRouter();
  const say = useToast();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!window.confirm("Cancelar a assinatura de teste no Mercado Pago? Esta ação não pode ser desfeita.")) return;
    setBusy(true);
    const response = await fetch("/api/billing/cancel", { method: "POST" }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) {
      say(result.error ?? "Não foi possível cancelar a assinatura.");
      return;
    }
    say("Assinatura de teste cancelada.");
    router.refresh();
  }

  return (
    <button disabled={!available || busy} onClick={cancel} className="btn btn-outline" style={{ color: available ? "var(--red)" : "var(--faint)", alignSelf: "flex-start", fontSize: 13, padding: "9px 16px" }}>
      {busy ? <span className="spinner" /> : null}
      Cancelar assinatura de teste
    </button>
  );
}
