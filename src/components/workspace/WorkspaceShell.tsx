"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, LogoMark, type IconName } from "@/components/icons";
import { soonMessage, ToastProvider, useToast } from "@/components/Toast";

type NavItem = { label: string; icon: IconName; href?: string };

const GROUPS: [string, NavItem[]][] = [
  ["INÍCIO", [{ label: "Visão Geral", icon: "home", href: "/app" }]],
  [
    "INTELIGÊNCIA JURÍDICA",
    [
      { label: "Assistente IA", icon: "spark", href: "/app/assistente" },
      { label: "Criação de Petições", icon: "pen", href: "/app/peticoes" },
      { label: "Análise Documental", icon: "fsearch" },
    ],
  ],
  [
    "PESQUISA E PROCESSOS",
    [
      { label: "Meus Processos", icon: "scale" },
      { label: "Consulta Processual", icon: "search" },
      { label: "Pesquisa Jurídica", icon: "book" },
      { label: "Legislação e Súmulas", icon: "landmark" },
      { label: "Jurisprudência", icon: "gavel" },
    ],
  ],
  [
    "ORGANIZAÇÃO",
    [
      { label: "Agenda e Prazos", icon: "cal", href: "/app/prazos" },
      { label: "Calculadoras", icon: "scale", href: "/app/calculadoras" },
      { label: "Meus Arquivos", icon: "folder" },
      { label: "Modelos Jurídicos", icon: "files" },
    ],
  ],
  [
    "MINHA CONTA",
    [
      { label: "Perfil", icon: "user", href: "/app/perfil" },
      { label: "Minha Assinatura", icon: "card", href: "/app/assinatura" },
      { label: "Meu Consumo", icon: "bar", href: "/app/consumo" },
      { label: "Configurações Pessoais", icon: "cog" },
    ],
  ],
];

const TITLES: Record<string, string> = {
  "/app": "Visão Geral",
  "/app/assistente": "Assistente Jurídico IA",
  "/app/peticoes": "Criação de Petições",
  "/app/assinatura": "Minha Assinatura",
  "/app/consumo": "Meu Consumo",
  "/app/perfil": "Perfil",
};

export type ShellUser = { email: string; isAdmin: boolean; planLabel: string };

function Shell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const say = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  return (
    <div className="shell">
      <div className={`drawer-bg${drawer ? " open" : ""}`} onClick={() => setDrawer(false)} />
      <aside className={`sidebar${collapsed ? " collapsed" : ""}${drawer ? " open" : ""}`} style={{ width: collapsed ? 68 : 216 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "2px 0 14px" }}>
          <LogoMark size={40} />
          {!collapsed && (
            <>
              <div className="serif" style={{ fontSize: 26, letterSpacing: ".14em", lineHeight: 1, fontWeight: 500, color: "var(--paper)" }}>
                JUSLEGIS
              </div>
              <div style={{ fontSize: 8.5, letterSpacing: ".26em", color: "var(--gold)" }}>INTELIGÊNCIA JURÍDICA</div>
            </>
          )}
        </div>
        <nav>
          {GROUPS.map(([head, items]) => (
            <div key={head}>
              <div className="nav-head">{head}</div>
              {items.map((item) => {
                const active = item.href === pathname;
                const content = (
                  <>
                    <Icon name={item.icon} />
                    <span className="nav-text" style={{ flex: 1 }}>
                      {item.label}
                    </span>
                  </>
                );
                return item.href ? (
                  <Link key={item.label} href={item.href} title={item.label} className={`nav-item${active ? " active" : ""}`} onClick={() => setDrawer(false)}>
                    {content}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    title={item.label}
                    className="nav-item"
                    onClick={() => {
                      setDrawer(false);
                      say(soonMessage(item.label));
                    }}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button className="sidebar-foot collapse-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Expandir menu" : "Recolher menu"} style={{ justifyContent: collapsed ? "center" : "flex-start" }}>
          <Icon name="collapse" style={{ transform: `rotate(${collapsed ? 180 : 0}deg)` }} />
          {!collapsed && <span>Recolher menu</span>}
        </button>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setDrawer(true)} aria-label="Menu">
            <Icon name="menu" color="#17191C" width={1.8} />
          </button>
          <div className="serif" style={{ fontSize: 24, fontWeight: 600 }}>
            {TITLES[pathname] ?? "JusLegis"}
          </div>
          <div style={{ flex: 1 }} />
          <Link href="/app/assinatura" className="tag hide-narrow" style={{ color: "var(--muted-2)" }}>
            {user.planLabel}
          </Link>
          <div style={{ position: "relative" }}>
            <button className="pill-user" onClick={() => setUserOpen((o) => !o)}>
              <span className="avatar">
                <Icon name="user" size={15} color="#B9965B" width={1.8} />
              </span>
              <span className="hide-narrow">Minha conta</span>
            </button>
            {userOpen && (
              <>
                <div onClick={() => setUserOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div className="dropdown">
                  <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
                  <Link className="dropdown-item" href="/app/perfil" onClick={() => setUserOpen(false)}>
                    Meu perfil
                  </Link>
                  <Link className="dropdown-item" href="/app/assinatura" onClick={() => setUserOpen(false)}>
                    Minha assinatura
                  </Link>
                  <Link className="dropdown-item" href="/app/consumo" onClick={() => setUserOpen(false)}>
                    Meu consumo
                  </Link>
                  {user.isAdmin && (
                    <Link className="dropdown-item" href="/admin" onClick={() => setUserOpen(false)}>
                      JusLegis Admin
                    </Link>
                  )}
                  <form action="/auth/signout" method="post">
                    <button type="submit" className="dropdown-item">
                      Sair
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export default function WorkspaceShell(props: { user: ShellUser; children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Shell {...props} />
    </ToastProvider>
  );
}
