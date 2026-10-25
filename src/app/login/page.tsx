import { isSupabaseConfigured } from "@/lib/env";
import { safeInternalPath } from "@/lib/safe-redirect";
import { LogoMark } from "@/components/icons";
import LoginForm from "./LoginForm";

export const metadata = { title: "Entrar — JusLegis" };

const ERRORS: Record<string, string> = {
  config: "Autenticação ainda não configurada no servidor (variáveis do Supabase ausentes).",
  oauth: "Não foi possível concluir o acesso por este link. Se você confirmou o e-mail, entre com seu e-mail e senha.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; next?: string; recovery?: string }> }) {
  const { erro, next, recovery } = await searchParams;
  const configured = isSupabaseConfigured();
  const safeNext = safeInternalPath(next);

  return (
    <div className="login-grid" style={{ minHeight: "100vh", display: "grid" }}>
      <style>{`
        .login-grid { grid-template-columns: 1fr; background: var(--ink); }
        .login-hero { display: none; }
        @media (min-width: 900px) { .login-grid { grid-template-columns: 1.1fr 1fr; } .login-hero { display: flex; } }
      `}</style>
      <div
        className="login-hero"
        style={{ position: "relative", background: "var(--ink)", color: "var(--paper)", flexDirection: "column", justifyContent: "space-between", padding: 48, overflow: "hidden" }}
      >
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,#1B1A17 0 14px,#211E19 14px 28px)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(23,25,28,.2),rgba(23,25,28,.9))" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <LogoMark size={36} />
          <span className="serif" style={{ fontSize: 28, letterSpacing: ".14em" }}>
            JUSLEGIS
          </span>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 14, maxWidth: 460 }}>
          <h1 className="serif" style={{ margin: 0, fontWeight: 500, fontSize: 48, lineHeight: 1.05 }}>
            Inteligência jurídica para uma advocacia mais eficiente.
          </h1>
          <p style={{ margin: 0, color: "#CFCABF", fontSize: 15, lineHeight: 1.6 }}>
            Petições, análise de documentos e pesquisa em uma única plataforma.
          </p>
        </div>
      </div>
      <div style={{ background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
        <LoginForm configured={configured} initialError={erro ? ERRORS[erro] ?? null : null} next={safeNext} recovery={recovery === "1"} />
      </div>
    </div>
  );
}
