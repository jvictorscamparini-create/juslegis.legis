import { isSupabaseConfigured } from "@/lib/env";
import OAuthConsent from "./OAuthConsent";

export const metadata = { title: "Autorizar acesso — JusLegis", robots: { index: false } };

// Tela de consentimento do servidor OAuth do Supabase (clientes MCP externos, como o Claude).
// Precisa ficar acessível sem sessão: sem login, o componente leva ao /login e volta para cá.
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id } = await searchParams;
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px", background: "var(--paper)" }}>
      <OAuthConsent authorizationId={authorization_id ?? null} configured={isSupabaseConfigured()} />
    </main>
  );
}
