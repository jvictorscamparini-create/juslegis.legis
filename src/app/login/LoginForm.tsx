"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authConfigurationError } from "@/lib/auth-errors";
import {
  isOAuthProviderEnabled,
  MIN_PASSWORD_LENGTH,
  networkErrorMessage,
  passwordRecoveryRedirect,
  passwordSignInError,
  signUpError,
  withTimeout,
} from "@/lib/auth-flow";

type Step = "auth" | "code" | "signup-sent" | "recovery-sent" | "new-password";
type BusyAction = "google" | "password" | "signup" | "code" | "recovery" | "update-password" | "verify";

const NOT_CONFIGURED = "Autenticação ainda não configurada no servidor.";
const GOOGLE_DISABLED = authConfigurationError({ code: "provider_disabled", message: "provider is not enabled" }, "google");

const BUSY_LABEL: Record<BusyAction, string> = {
  google: "Abrindo o Google…",
  password: "Entrando…",
  signup: "Criando conta…",
  code: "Enviando código…",
  recovery: "Enviando link…",
  "update-password": "Atualizando…",
  verify: "Verificando…",
};

const inputStyle: React.CSSProperties = {
  height: 44,
  border: "1px solid var(--field)",
  borderRadius: 11,
  padding: "0 14px",
  fontSize: 14,
  outline: 0,
  background: "#fff",
  width: "100%",
};

export default function LoginForm({
  configured,
  googleStatus,
  initialError,
  next,
  recovery,
}: {
  configured: boolean;
  /** true/false: estado lido no servidor; null: não foi possível consultar (o clique confere de novo). */
  googleStatus: boolean | null;
  initialError: string | null;
  next: string;
  recovery: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [step, setStep] = useState<Step>(recovery ? "new-password" : "auth");
  const [emailMethod, setEmailMethod] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? (configured ? null : NOT_CONFIGURED));
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  // Trava síncrona contra clique duplo: o estado do React só atualiza no próximo render.
  const inFlight = useRef(false);
  const busy = busyAction !== null;
  const up = mode === "up";

  const supabase = configured ? createClient() : null;
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  function finishLogin(destination = next) {
    router.replace(destination);
    router.refresh();
  }

  function callbackUrl(destination = next) {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;
  }

  /**
   * Executa uma ação de autenticação com trava de clique duplo, indicador de carregamento
   * e mensagem clara para falha de rede/timeout. A ação devolve true quando a página vai
   * navegar (o indicador fica ligado até a troca de página).
   */
  async function run(action: BusyAction, task: (client: NonNullable<typeof supabase>) => Promise<boolean | void>) {
    if (inFlight.current) return;
    if (!configured || !supabase) {
      setError(NOT_CONFIGURED);
      return;
    }
    inFlight.current = true;
    setBusyAction(action);
    setError(null);
    let navigating = false;
    try {
      navigating = (await task(supabase)) === true;
    } catch (err) {
      setError(networkErrorMessage(err));
    } finally {
      if (!navigating) {
        inFlight.current = false;
        setBusyAction(null);
      }
    }
  }

  function google() {
    if (googleStatus === false) {
      setError(GOOGLE_DISABLED);
      return;
    }
    return run("google", async (client) => {
      // Sem leitura no servidor, confere agora: com o Google desligado o Supabase mostraria uma página de erro.
      if (googleStatus === null && !(await isOAuthProviderEnabled("google", fetch, 3000))) {
        setError(GOOGLE_DISABLED);
        return;
      }
      const { data, error } = await withTimeout(
        client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(), skipBrowserRedirect: true } }),
      );
      if (error || !data?.url) {
        setError(authConfigurationError(error ?? { message: "missing oauth url" }, "google"));
        return;
      }
      window.location.assign(data.url);
      return true;
    });
  }

  function signInWithPassword() {
    if (!validEmail || !password) {
      setError("Informe um e-mail e uma senha válidos.");
      return;
    }
    return run("password", async (client) => {
      const { error } = await withTimeout(client.auth.signInWithPassword({ email: email.trim(), password }));
      if (error) {
        setError(error.code === "email_not_confirmed" ? authConfigurationError(error, "email") : passwordSignInError(error.status));
        return;
      }
      finishLogin();
      return true;
    });
  }

  function signUp() {
    if (!validEmail) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    return run("signup", async (client) => {
      const { data, error } = await withTimeout(
        client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: callbackUrl() } }),
      );
      if (error) {
        setError(signUpError(error));
        return;
      }
      // Com confirmação de e-mail desligada no Supabase a sessão já vem pronta.
      if (data.session) {
        finishLogin();
        return true;
      }
      setStep("signup-sent");
    });
  }

  function sendCode() {
    if (!validEmail) {
      setError("Informe um e-mail válido.");
      return;
    }
    return run("code", async (client) => {
      const { error } = await withTimeout(
        client.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: up, emailRedirectTo: callbackUrl() } }),
      );
      if (error) {
        setError(
          error.code === "user_not_found" || /user not found|signups not allowed for otp/i.test(error.message)
            ? "Não encontramos uma conta com este e-mail. Use “Criar conta”."
            : authConfigurationError(error, "email"),
        );
        return;
      }
      setCode("");
      setStep("code");
    });
  }

  function sendPasswordRecovery() {
    if (!validEmail) {
      setError("Informe o e-mail da sua conta.");
      return;
    }
    return run("recovery", async (client) => {
      const { error } = await withTimeout(
        client.auth.resetPasswordForEmail(email.trim(), { redirectTo: passwordRecoveryRedirect(window.location.origin) }),
      );
      if (error) {
        setError(error.status === 429 ? "Muitas tentativas. Aguarde alguns instantes e tente de novo." : "Não foi possível enviar o link de recuperação. Tente novamente.");
        return;
      }
      setStep("recovery-sent");
    });
  }

  function updatePassword() {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    return run("update-password", async (client) => {
      const { error } = await withTimeout(client.auth.updateUser({ password: newPassword }));
      if (error) {
        setError(
          error.code === "same_password"
            ? "A nova senha precisa ser diferente da atual."
            : error.code === "weak_password"
              ? `Escolha uma senha mais forte, com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
              : "Não foi possível atualizar a senha. Solicite um novo link de recuperação.",
        );
        return;
      }
      finishLogin("/app");
      return true;
    });
  }

  function verify() {
    if (!/^\d{6}$/.test(code)) {
      setError("Informe o código de 6 dígitos.");
      return;
    }
    return run("verify", async (client) => {
      const { error } = await withTimeout(client.auth.verifyOtp({ email: email.trim(), token: code, type: "email" }));
      if (error) {
        setError(error.status === 429 ? "Muitas tentativas. Aguarde alguns instantes e tente de novo." : "Código inválido ou expirado. Solicite um novo código.");
        return;
      }
      finishLogin();
      return true;
    });
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
            type="button"
            onClick={google}
            disabled={!configured || busy}
            className="btn btn-outline"
            style={{ height: 46, borderRadius: 11, fontSize: 14, gap: 10, width: "100%" }}
            aria-busy={busyAction === "google"}
          >
            {busyAction === "google" ? (
              <>
                <span className="spinner" />
                <span>{BUSY_LABEL.google}</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#17191C" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
                <span>Continuar com Google</span>
              </>
            )}
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
              onKeyDown={(e) => e.key === "Enter" && (up ? signUp() : emailMethod === "code" ? sendCode() : signInWithPassword())}
              placeholder="seu@email.com.br"
              type="email"
              autoComplete="email"
              style={inputStyle}
              disabled={busy}
            />
          </label>
          {(up || emailMethod === "password") && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
              Senha
              <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
                <input
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && (up ? signUp() : signInWithPassword())}
                  type={showPassword ? "text" : "password"}
                  autoComplete={up ? "new-password" : "current-password"}
                  placeholder={up ? `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres` : undefined}
                  style={{ ...inputStyle, paddingRight: 42 }}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Ocultar senha" : "Exibir senha"}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--muted)",
                    padding: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
          )}
          {error && <div style={{ fontSize: 12.5, color: "var(--red)", lineHeight: 1.5 }}>{error}</div>}
          <button
            type="button"
            onClick={up ? signUp : emailMethod === "code" ? sendCode : signInWithPassword}
            disabled={!configured || busy}
            className="btn btn-dark"
            style={{ height: 46, borderRadius: 11, fontSize: 14, width: "100%" }}
            aria-busy={busy && busyAction !== "google"}
          >
            {busyAction && busyAction !== "google" ? (
              <>
                <span className="spinner" />
                <span>{BUSY_LABEL[busyAction]}</span>
              </>
            ) : (
              up ? "Criar conta" : emailMethod === "code" ? "Enviar código por e-mail" : "Entrar"
            )}
          </button>
          {!up && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              {emailMethod === "password" ? (
                <button type="button" onClick={sendPasswordRecovery} disabled={!configured || busy} style={{ color: "var(--bronze)" }}>Esqueci minha senha</button>
              ) : <span />}
              <button
                type="button"
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
              type="button"
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
            disabled={busy}
          />
          <button type="button" onClick={verify} disabled={busy} className="btn btn-dark" style={{ height: 46, borderRadius: 11, fontSize: 14, width: "100%" }}>
            {busy ? (
              <>
                <span className="spinner" />
                <span>{BUSY_LABEL.verify}</span>
              </>
            ) : "Verificar código"}
          </button>
          {error && <div className="alert-err">{error}</div>}
          <button type="button" onClick={() => { setStep("auth"); setError(null); }} style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            Usar outro e-mail
          </button>
        </>
      ) : step === "signup-sent" ? (
        <>
          <h2 className="serif" style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>Confirme seu e-mail</h2>
          <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Enviamos um link de confirmação para <b style={{ color: "var(--ink)" }}>{email}</b>. Abra o e-mail e clique no link para ativar sua conta. Depois é só entrar com seu e-mail e senha.
          </div>
          <button
            type="button"
            onClick={() => { setMode("in"); setEmailMethod("password"); setStep("auth"); setError(null); }}
            className="btn btn-outline"
            style={{ height: 46, borderRadius: 11, width: "100%" }}
          >
            Voltar para entrar
          </button>
        </>
      ) : step === "recovery-sent" ? (
        <>
          <h2 className="serif" style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>Confira seu e-mail</h2>
          <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Se houver uma conta para <b style={{ color: "var(--ink)" }}>{email}</b>, enviaremos um link para redefinir sua senha.
          </div>
          <button type="button" onClick={() => { setStep("auth"); setError(null); }} className="btn btn-outline" style={{ height: 46, borderRadius: 11, width: "100%" }}>Voltar ao login</button>
        </>
      ) : (
        <>
          <h2 className="serif" style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>Crie uma nova senha</h2>
          <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>Use pelo menos 8 caracteres para proteger sua conta.</div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            Nova senha
            <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
              <input
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && updatePassword()}
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                style={{ ...inputStyle, paddingRight: 42 }}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((shown) => !shown)}
                aria-label={showNewPassword ? "Ocultar nova senha" : "Exibir nova senha"}
                aria-pressed={showNewPassword}
                title={showNewPassword ? "Ocultar nova senha" : "Exibir nova senha"}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted)",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {showNewPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>
          {error && <div className="alert-err">{error}</div>}
          <button type="button" onClick={updatePassword} disabled={!configured || busy} className="btn btn-dark" style={{ height: 46, borderRadius: 11, fontSize: 14, width: "100%" }}>
            {busy ? (
              <>
                <span className="spinner" />
                <span>Atualizando…</span>
              </>
            ) : "Atualizar senha"}
          </button>
        </>
      )}
    </div>
  );
}
