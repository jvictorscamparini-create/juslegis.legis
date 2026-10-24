"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authConfigurationError } from "@/lib/auth-errors";
import { passwordRecoveryRedirect, passwordSignInError } from "@/lib/auth-flow";

type Step = "auth" | "code" | "recovery-sent" | "new-password";

const inputStyle: React.CSSProperties = {
  height: 44,
  border: "1px solid var(--field)",
  borderRadius: 11,
  padding: "0 14px",
  fontSize: 14,
  outline: 0,
  background: "#fff",
};

export default function LoginForm({ configured, initialError, next, recovery }: { configured: boolean; initialError: string | null; next: string; recovery: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [step, setStep] = useState<Step>(recovery ? "new-password" : "auth");
  const [emailMethod, setEmailMethod] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? (configured ? null : "Autenticação ainda não configurada no servidor."));
  const [busy, setBusy] = useState(false);
  const up = mode === "up";

  const supabase = configured ? createClient() : null;
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  function finishLogin(destination = next) {
    router.replace(destination);
    router.refresh();
  }

  async function google() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(authConfigurationError(error, "google"));
      setBusy(false);
    }
  }

  async function signInWithPassword() {
    if (!validEmail || !password) {
      setError("Informe um e-mail e uma senha válidos.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(passwordSignInError(error.status));
      return;
    }
    finishLogin();
  }

  async function sendCode() {
    if (!validEmail) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: up, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      const message = error.code === "user_not_found" || /user not found/i.test(error.message)
        ? "Não encontramos uma conta com este e-mail. Use “Criar conta”."
        : authConfigurationError(error, "email");
      setError(message);
      return;
    }
    setCode("");
    setStep("code");
  }

  async function sendPasswordRecovery() {
    if (!validEmail) {
      setError("Informe o e-mail da sua conta.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordRecoveryRedirect(window.location.origin),
    });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? "Muitas tentativas. Aguarde alguns instantes e tente de novo." : "Não foi possível enviar o link de recuperação. Tente novamente.");
      return;
    }
    setStep("recovery-sent");
  }

  async function updatePassword() {
    if (newPassword.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      setError("Não foi possível atualizar a senha. Solicite um novo link de recuperação.");
      return;
    }
    finishLogin("/app");
  }

  async function verify() {
    if (!supabase || code.length < 6) {
      setError("Informe o código de 6 dígitos.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
    if (error) {
      setBusy(false);
      setError("Código inválido ou expirado. Solicite um novo código.");
      return;
    }
    finishLogin();
  }

  return (
    <div style={{ width: 400, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
      {step === "auth" ? (
        <>
          <div>
            <h2 className="serif" style={{ margin: 0, fontSize: 36, fontWeight: 600 }}>
              {up ? "Criar conta" : "Entrar"}
            </h2>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
              {up ? "Comece um teste gratuito de 72 horas, sem cartão e sem cobrança automática." : "Acesse seu workspace jurídico."}
            </div>
          </div>
          <button
            onClick={google}
            disabled={!configured || busy}
            className="btn btn-outline"
            style={{ height: 46, borderRadius: 11, fontSize: 14, gap: 10 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#17191C" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            Continuar com Google
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--muted)" }}>
            <span style={{ flex: 1, height: 1, background: "#E3DFD6" }} />
            ou
            <span style={{ flex: 1, height: 1, background: "#E3DFD6" }} />
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            E-mail
            <input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && (up || emailMethod === "code" ? sendCode() : signInWithPassword())}
              placeholder="seu@email.com.br"
              type="email"
              autoComplete="email"
              style={inputStyle}
            />
          </label>
          {!up && emailMethod === "password" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
              Senha
              <input
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && signInWithPassword()}
                type="password"
                autoComplete="current-password"
                style={inputStyle}
              />
            </label>
          )}
          {error && <div style={{ fontSize: 12.5, color: "var(--red)", lineHeight: 1.5 }}>{error}</div>}
          <button
            onClick={up || emailMethod === "code" ? sendCode : signInWithPassword}
            disabled={!configured || busy}
            className="btn btn-dark"
            style={{ height: 46, borderRadius: 11, fontSize: 14 }}
          >
            {busy ? <span className="spinner" /> : null}
            {up || emailMethod === "code" ? "Enviar código por e-mail" : "Entrar com senha"}
          </button>
          {!up && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              {emailMethod === "password" ? (
                <button onClick={sendPasswordRecovery} disabled={!configured || busy} style={{ color: "var(--bronze)" }}>Esqueci minha senha</button>
              ) : <span />}
              <button
                onClick={() => { setEmailMethod(emailMethod === "password" ? "code" : "password"); setError(null); }}
                disabled={busy}
                style={{ color: "var(--bronze)" }}
              >
                {emailMethod === "password" ? "Entrar com código" : "Entrar com senha"}
              </button>
            </div>
          )}
          <div style={{ fontSize: 13, color: "var(--muted-2)", textAlign: "center" }}>
            {up ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
            <button
              onClick={() => {
                setMode(up ? "in" : "up");
                setEmailMethod("password");
                setError(configured ? null : error);
              }}
              style={{ color: "var(--bronze)", fontWeight: 600 }}
            >
              {up ? "Entrar" : "Criar conta"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>
            Sem CPF, telefone ou endereço. Teste gratuito de 72 horas, sem cartão.
          </div>
        </>
      ) : step === "code" ? (
        <>
          <div>
            <h2 className="serif" style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>
              Confirme seu e-mail
            </h2>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
              Informe o código de verificação enviado para <b style={{ color: "var(--ink)" }}>{email}</b>.
            </div>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            maxLength={6}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            style={{ ...inputStyle, height: 52, textAlign: "center", fontSize: 24, letterSpacing: ".4em" }}
          />
          <button onClick={verify} disabled={busy} className="btn btn-dark" style={{ height: 46, borderRadius: 11, fontSize: 14 }}>
            {busy ? <span className="spinner" /> : null}
            Verificar código
          </button>
          {error && <div className="alert-err">{error}</div>}
          <button onClick={() => { setStep("auth"); setError(null); }} style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            Usar outro e-mail
          </button>
        </>
      ) : step === "recovery-sent" ? (
        <>
          <h2 className="serif" style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>Confira seu e-mail</h2>
          <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Se houver uma conta para <b style={{ color: "var(--ink)" }}>{email}</b>, enviaremos um link para redefinir sua senha.
          </div>
          <button onClick={() => { setStep("auth"); setError(null); }} className="btn btn-outline" style={{ height: 46, borderRadius: 11 }}>Voltar ao login</button>
        </>
      ) : (
        <>
          <h2 className="serif" style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>Crie uma nova senha</h2>
          <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>Use pelo menos 8 caracteres para proteger sua conta.</div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            Nova senha
            <input
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && updatePassword()}
              type="password"
              autoComplete="new-password"
              style={inputStyle}
            />
          </label>
          {error && <div className="alert-err">{error}</div>}
          <button onClick={updatePassword} disabled={!configured || busy} className="btn btn-dark" style={{ height: 46, borderRadius: 11, fontSize: 14 }}>
            {busy ? <span className="spinner" /> : null}
            Atualizar senha
          </button>
        </>
      )}
    </div>
  );
}
