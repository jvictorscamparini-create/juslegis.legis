"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/icons";

type Decision = "approve" | "deny";

// Descrição, em português, do que cada escopo OAuth significa. O acesso aos dados
// em si é limitado pelas ferramentas da JusLegis (somente leitura) e pelo RLS.
const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirmar sua identidade",
  email: "Ver o seu e-mail",
  profile: "Ver o seu nome",
};

export default function OAuthConsent({ authorizationId, configured }: { authorizationId: string | null; configured: boolean }) {
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<Decision | null>(null);
  const deciding = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!configured) {
        setError("Autenticação ainda não configurada no servidor.");
        setLoading(false);
        return;
      }
      if (!authorizationId) {
        setError("Esta página precisa de um pedido de autorização. Comece de novo a partir do aplicativo que quer se conectar.");
        setLoading(false);
        return;
      }
      const supabase = createClient();
      if (!supabase) {
        setError("Autenticação ainda não configurada no servidor.");
        setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // Volta para esta mesma tela depois do login (o /login só aceita caminhos internos).
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError("Não foi possível carregar o pedido de autorização. Ele pode ter expirado; comece de novo no aplicativo.");
        setLoading(false);
        return;
      }
      // Quando o usuário já autorizou este cliente antes, o Supabase devolve só o redirecionamento.
      if (!("authorization_id" in data)) {
        window.location.replace(data.redirect_url);
        return;
      }
      setDetails(data);
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [authorizationId, configured]);

  const decide = useCallback(
    async (action: Decision) => {
      if (!authorizationId || deciding.current) return;
      const supabase = createClient();
      if (!supabase) return;
      deciding.current = true;
      setDecision(action);
      setError(null);
      const result =
        action === "approve"
          ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
          : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (result.error || !result.data?.redirect_url) {
        setError("Não foi possível registrar a sua decisão. Comece de novo no aplicativo.");
        setDecision(null);
        deciding.current = false;
        return;
      }
      window.location.assign(result.data.redirect_url);
    },
    [authorizationId],
  );

  const scopes = details ? details.scope.split(" ").filter(Boolean) : [];

  return (
    <div className="card" style={{ width: "100%", maxWidth: 480, padding: "28px 28px 24px", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMark size={28} />
        <span className="serif" style={{ fontSize: 22, letterSpacing: ".14em" }}>
          JUSLEGIS
        </span>
      </div>

      {loading ? (
        <p role="status" style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          Carregando o pedido de autorização…
        </p>
      ) : !details ? (
        <p role="alert" style={{ margin: 0, color: "var(--red)", fontSize: 14, lineHeight: 1.5 }}>
          {error}
        </p>
      ) : (
        <>
          <div>
            <h1 className="serif" style={{ margin: 0, fontWeight: 500, fontSize: 30, lineHeight: 1.1 }}>
              Autorizar {details.client.name}
            </h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14, lineHeight: 1.55 }}>
              Este aplicativo quer acessar a sua conta da JusLegis para consultar os seus casos, petições, documentos e conversas.
            </p>
          </div>

          <dl style={{ margin: 0, border: "1px solid var(--line)", borderRadius: 12, fontSize: 13.5 }}>
            <Row label="Aplicativo" value={details.client.name} />
            <Row label="Retorna para" value={details.redirect_uri} />
            <Row label="Conta" value={details.user.email ?? ""} />
            {scopes.length > 0 && <Row label="Permissões" value={scopes.map((s) => SCOPE_LABELS[s] ?? s).join(", ")} last />}
          </dl>

          <p style={{ margin: 0, color: "var(--muted-2)", fontSize: 13, lineHeight: 1.55 }}>
            O acesso é somente de leitura e restrito aos seus próprios dados. Autorize apenas se você reconhece este aplicativo; você pode revogar depois.
          </p>

          {error && (
            <p role="alert" style={{ margin: 0, color: "var(--red)", fontSize: 13 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-outline" disabled={decision !== null} onClick={() => void decide("deny")}>
              {decision === "deny" ? "Negando…" : "Negar"}
            </button>
            <button type="button" className="btn btn-dark" disabled={decision !== null} onClick={() => void decide("approve")}>
              {decision === "approve" ? "Autorizando…" : "Permitir acesso"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "12px 16px", borderBottom: last ? 0 : "1px solid var(--line)" }}>
      <dt style={{ color: "var(--muted)" }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{value}</dd>
    </div>
  );
}
