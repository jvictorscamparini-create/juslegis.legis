"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

export default function SubscribeButton({ disabled }: { disabled: boolean }) {
  const say = useToast();
  const [busy, setBusy] = useState(false);
  async function subscribe() {
    setBusy(true);
    const res = await fetch("/api/billing/checkout", { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    setBusy(false);
    say(data.error ?? "Não foi possível iniciar o checkout.");
  }
  return (
    <button className="btn btn-gold" onClick={subscribe} disabled={disabled || busy} style={{ padding: "12px 20px", fontSize: 14, alignSelf: "flex-start" }}>
      {busy && <span className="spinner" />}
      Assinar
    </button>
  );
}
