"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Step = "auth" | "code";

const inputStyle: React.CSSProperties = {
  height: 44,
  border: "1px solid var(--field)",
  borderRadius: 11,
  padding: "0 14px",
  fontSize: 14,
  outline: 0,
  background: "#fff",
};

export default function LoginForm({ configured, initialError, next }: { configured: boolean; initialError: string | null; next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [step, setStep] = useState<Step>("auth");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? (configured ? null : "Autenticação ainda não configurada no servidor."));
  const [busy, setBusy] = useState(false);
  const up = mode === "up";

  const supabase = configured ? createClient() : null;

  async function google() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError("Não foi possível iniciar o login com Google. Verifique se o provedor está habilitado no Supabase.");
      setBusy(false);
    }
  }

  async function sendCode() {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
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
      const notFound = /signups not allowed|user not found/i.test(error.message);
      setError(
        notFound
          ? "Não encontramos uma conta com este e-mail. Use “Criar conta”."
          : error.status === 429
            ? "Muitas tentativas. Aguarde alguns instantes e tente de novo."
            : "Não foi possível enviar o código. Tente novamente.",
      );
      return;
    }
    setCode("");
    setStep("code");
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
    router.replace(next);
    router.refresh();
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
              {up ? "Comece o teste gratuito de 7 dias em poucos segundos." : "Acesse seu workspace jurídico."}
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
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
              placeholder="seu@email.com.br"
              type="email"
              autoComplete="email"
              style={inputStyle}
            />
          </label>
          {error && <div style={{ fontSize: 12.5, color: "var(--red)", lineHeight: 1.5 }}>{error}</div>}
          <button onClick={sendCode} disabled={!configured || busy} className="btn btn-dark" style={{ height: 46, borderRadius: 11, fontSize: 14 }}>
            {busy ? <span className="spinner" /> : null}
            Enviar código por e-mail
          </button>
          <div style={{ fontSize: 13, color: "var(--muted-2)", textAlign: "center" }}>
            {up ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
            <button
              onClick={() => {
                setMode(up ? "in" : "up");
                setError(configured ? null : error);
              }}
              style={{ color: "var(--bronze)", fontWeight: 600 }}
            >
              {up ? "Entrar" : "Criar conta"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>
            Sem CPF, telefone ou endereço. Teste gratuito de 7 dias, sem cartão.
          </div>
        </>
      ) : (
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
      )}
    </div>
  );
}
