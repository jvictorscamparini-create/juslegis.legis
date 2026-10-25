"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fullNameError, MAX_NAME_LENGTH, MIN_NEW_PASSWORD_LENGTH, newPasswordError, normalizeFullName, passwordUpdateError } from "@/lib/profile";

type Feedback = { kind: "ok" | "err"; text: string } | null;

function Message({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return <div className={feedback.kind === "ok" ? "alert-ok" : "alert-err"} role={feedback.kind === "ok" ? "status" : "alert"}>{feedback.text}</div>;
}

export function NameForm({ userId, initialName }: { userId: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function save() {
    const problem = fullNameError(name);
    if (problem) return setFeedback({ kind: "err", text: problem });
    const supabase = createClient();
    if (!supabase) return setFeedback({ kind: "err", text: "Autenticação não configurada no servidor." });
    setBusy(true);
    setFeedback(null);
    // A política de segurança do banco só deixa o usuário alterar o próprio nome (e nenhuma outra coluna).
    const { error } = await supabase.from("profiles").update({ full_name: normalizeFullName(name) }).eq("id", userId);
    setBusy(false);
    if (error) return setFeedback({ kind: "err", text: "Não foi possível salvar o nome. Tente novamente." });
    setFeedback({ kind: "ok", text: "Nome atualizado." });
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label className="field">
        Nome completo
        <input className="input" value={name} maxLength={MAX_NAME_LENGTH} autoComplete="name" onChange={(e) => { setName(e.target.value); setFeedback(null); }} onKeyDown={(e) => e.key === "Enter" && save()} />
      </label>
      <Message feedback={feedback} />
      <div>
        <button className="btn btn-dark" onClick={save} disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          Salvar nome
        </button>
      </div>
    </div>
  );
}

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function save() {
    const problem = newPasswordError(password, confirmation);
    if (problem) return setFeedback({ kind: "err", text: problem });
    const supabase = createClient();
    if (!supabase) return setFeedback({ kind: "err", text: "Autenticação não configurada no servidor." });
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setFeedback({ kind: "err", text: passwordUpdateError(error) });
    setPassword("");
    setConfirmation("");
    setFeedback({ kind: "ok", text: "Senha atualizada. Use-a nos próximos acessos." });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label className="field">
        Nova senha
        <input className="input" type="password" autoComplete="new-password" value={password} placeholder={`Mínimo de ${MIN_NEW_PASSWORD_LENGTH} caracteres`} onChange={(e) => { setPassword(e.target.value); setFeedback(null); }} />
      </label>
      <label className="field">
        Confirmar nova senha
        <input className="input" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => { setConfirmation(e.target.value); setFeedback(null); }} onKeyDown={(e) => e.key === "Enter" && save()} />
      </label>
      <Message feedback={feedback} />
      <div>
        <button className="btn btn-dark" onClick={save} disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          Atualizar senha
        </button>
      </div>
    </div>
  );
}
