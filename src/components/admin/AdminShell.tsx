"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Icon, LogoMark, type IconName } from "@/components/icons";
import { soonMessage, ToastProvider, useToast } from "@/components/Toast";

type Item = { label: string; icon: IconName; href?: string };

const GROUPS: [string, Item[]][] = [
  ["VISÃO GERAL", [{ label: "Dashboard", icon: "home", href: "/admin" }, { label: "Monitoramento", icon: "act" }]],
  [
    "INTELIGÊNCIA ARTIFICIAL",
    [
      { label: "Modelos de IA", icon: "cpu", href: "/admin/ia?tab=modelo" },
      { label: "Configurações", icon: "cog", href: "/admin/ia?tab=limites" },
      { label: "Prompts", icon: "term", href: "/admin/ia?tab=prompts" },
      { label: "Consumo e custos", icon: "bar" },
    ],
  ],
  [
    "INTEGRAÇÕES",
    [
      { label: "Gerenciamento de APIs", icon: "plug", href: "/admin/apis" },
      { label: "Mercado Pago", icon: "card", href: "/admin/mercado-pago?tab=planos" },
      { label: "Fontes jurídicas", icon: "landmark", href: "/admin/apis?tab=jur" },
      { label: "Webhooks", icon: "link", href: "/admin/mercado-pago?tab=webhooks" },
    ],
  ],
  [
    "GESTÃO",
    [
      { label: "Usuários", icon: "users", href: "/admin/usuarios" },
      { label: "Permissões", icon: "key" },
      { label: "Plano padrão", icon: "tag", href: "/admin/plano?tab=planos" },
      { label: "Assinaturas", icon: "card", href: "/admin/mercado-pago?tab=assinaturas" },
      { label: "Teste gratuito", icon: "clock", href: "/admin/plano?tab=trial" },
    ],
  ],
  [
    "SISTEMA",
    [
      { label: "Funcionalidades", icon: "tog", href: "/admin/ia?tab=recursos" },
      { label: "Aparência", icon: "pal" },
      { label: "Segurança", icon: "shield" },
      { label: "Logs", icon: "doc", href: "/admin/logs" },
      { label: "Configurações gerais", icon: "cog" },
    ],
  ],
];

function Shell({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const say = useToast();
  const [drawer, setDrawer] = useState(false);
  const current = pathname + (params.get("tab") ? `?tab=${params.get("tab")}` : "");
  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === "/admin") return pathname === "/admin";
    const [p, q] = href.split("?");
    if (p !== pathname) return false;
    if (!q) return !params.get("tab") || p === "/admin/apis" || p === "/admin/usuarios";
    return current === href;
  };

  return (
    <div className="shell">
      <div className={`drawer-bg${drawer ? " open" : ""}`} onClick={() => setDrawer(false)} />
      <aside className={`sidebar${drawer ? " open" : ""}`} style={{ width: 224 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 8px 16px" }}>
          <LogoMark size={30} width={1.7} />
          <div style={{ lineHeight: 1.1 }}>
            <div className="serif" style={{ fontSize: 22, letterSpacing: ".12em", color: "var(--paper)" }}>JUSLEGIS</div>
            <div style={{ fontSize: 9, letterSpacing: ".3em", color: "var(--gold)", fontWeight: 600 }}>ADMIN</div>
          </div>
        </div>
        <nav>
          {GROUPS.map(([head, items]) => (
            <div key={head}>
              <div className="nav-head">{head}</div>
              {items.map((it) => {
                const inner = (
                  <>
                    <Icon name={it.icon} size={16} />
                    <span className="nav-text">{it.label}</span>
                  </>
                );
                const style = { padding: "7px 10px", fontSize: 13, borderRadius: 8 };
                return it.href ? (
                  <Link key={it.label} href={it.href} className={`nav-item${isActive(it.href) ? " active" : ""}`} style={style} onClick={() => setDrawer(false)}>
                    {inner}
                  </Link>
                ) : (
                  <button key={it.label} className="nav-item" style={style} onClick={() => { setDrawer(false); say(soonMessage(it.label)); }}>
                    {inner}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <Link href="/app" className="sidebar-foot">
          <Icon name="back" size={16} />
          Voltar ao workspace
        </Link>
      </aside>
      <main className="main">
        <div className="topbar" style={{ padding: "0 28px" }}>
          <button className="menu-btn" onClick={() => setDrawer(true)} aria-label="Menu">
            <Icon name="menu" color="#17191C" width={1.8} />
          </button>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{crumb}</div>
          <div style={{ flex: 1 }} />
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-link" style={{ marginRight: 8 }}>Sair</button>
          </form>
          <span className="avatar" style={{ width: 32, height: 32 }} title="Administrador">
            <Icon name="user" size={16} color="#B9965B" width={1.8} />
          </span>
        </div>
        <div style={{ padding: "28px 36px 48px", maxWidth: 1180, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>{children}</div>
      </main>
    </div>
  );
}

export default function AdminShell(props: { crumb: string; children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Suspense>
        <Shell {...props} />
      </Suspense>
    </ToastProvider>
  );
}
