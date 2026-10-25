import Link from "next/link";
import { isAdminProfile, requireUser } from "@/lib/auth";
import { NameForm, PasswordForm } from "./ProfileForms";

export const metadata = { title: "Perfil — JusLegis" };

const card: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 24, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 14 };

export default async function ProfilePage() {
  const { user, profile } = await requireUser();
  const admin = isAdminProfile(profile);
  const since = new Date(profile?.created_at ?? user.created_at).toLocaleDateString("pt-BR");

  return (
    <div style={{ padding: "32px 36px 40px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <div>
        <h1 className="h-page">Perfil</h1>
        <p className="sub">Seus dados de acesso à JusLegis.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, alignItems: "start", maxWidth: 900 }}>
        <section style={card}>
          <h2 className="h-card">Dados da conta</h2>
          <NameForm userId={user.id} initialName={profile?.full_name ?? ""} />
          <div className="row" style={{ borderTop: "1px solid var(--line-2)" }}>
            <span style={{ flex: 1, color: "var(--muted)" }}>E-mail</span>
            <b style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{user.email}</b>
          </div>
          <div className="row">
            <span style={{ flex: 1, color: "var(--muted)" }}>Tipo de conta</span>
            <b style={{ fontWeight: 600 }}>{admin ? "Administrador Geral" : "Advogado"}</b>
          </div>
          <div className="row">
            <span style={{ flex: 1, color: "var(--muted)" }}>Cliente desde</span>
            <b style={{ fontWeight: 600 }}>{since}</b>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>O e-mail é o seu login e não pode ser alterado por aqui.</div>
          {admin && (
            <div>
              <Link href="/admin" className="btn btn-outline">Abrir painel do administrador</Link>
            </div>
          )}
        </section>
        <section style={card}>
          <h2 className="h-card">Senha</h2>
          <div style={{ fontSize: 13, color: "var(--muted-2)", lineHeight: 1.5 }}>
            Defina uma senha para entrar com e-mail e senha, sem precisar de código por e-mail.
          </div>
          <PasswordForm />
        </section>
      </div>
    </div>
  );
}
