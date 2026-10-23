"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toast";

export default function UserStatusButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const say = useToast();
  const [busy, setBusy] = useState(false);
  const next = status === "active" ? "blocked" : "active";
  async function toggle() {
    if (!confirm(next === "blocked" ? "Bloquear este usuário?" : "Reativar este usuário?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: next }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return say("Não foi possível alterar o usuário.");
    router.refresh();
  }
  return (
    <button className="btn-link" onClick={toggle} disabled={busy}>
      {status === "active" ? "Bloquear" : "Reativar"}
    </button>
  );
}
