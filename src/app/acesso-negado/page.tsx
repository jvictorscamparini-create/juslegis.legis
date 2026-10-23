import Link from "next/link";
import { Icon } from "@/components/icons";

export const metadata = { title: "Acesso negado — JusLegis" };

export default async function AccessDenied({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  const blocked = motivo === "bloqueado";
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div
        style={{
          width: 440,
          maxWidth: "100%",
          background: "#fff",
          borderRadius: 20,
          padding: 36,
          boxShadow: "0 1px 3px rgba(23,25,28,.08)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="shield" size={26} color="#B9965B" />
        </div>
        <h1 className="serif" style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>
          Acesso negado
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
          {blocked
            ? "Sua conta está bloqueada. Entre em contato com o suporte da JusLegis."
            : "Sua conta não tem permissão para acessar a área administrativa. Se você é advogado, use o seu workspace."}
        </p>
        {!blocked && (
          <Link href="/app" className="btn btn-dark" style={{ padding: "12px 22px", fontSize: 14 }}>
            Ir para meu workspace
          </Link>
        )}
        <form action="/auth/signout" method="post">
          <button type="submit" style={{ fontSize: 13, color: "var(--bronze)", fontWeight: 600 }}>
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
