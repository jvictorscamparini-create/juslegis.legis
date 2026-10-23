"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { soonMessage, useToast } from "@/components/Toast";

const PALETTE = {
  b: ["#EFF3FB", "#DCE7F7", "#3E5C8F"],
  g: ["#E9F4EE", "#D3EADC", "#2F6B4C"],
  e: ["#F6EFE6", "#EBDDC8", "#795A38"],
  r: ["#F8ECEC", "#F0D6D6", "#9A4A4A"],
} as const;

export function QuickAction(props: { title: string; text: string; icon: IconName; tone: keyof typeof PALETTE; href?: string; soon?: string; tag?: string }) {
  const say = useToast();
  const [bg, ic, fg] = PALETTE[props.tone];
  const style: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 22,
    borderRadius: 20,
    background: bg,
    minHeight: 172,
    boxShadow: "0 1px 2px rgba(23,25,28,.04)",
    color: "var(--ink)",
  };
  const body = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", gap: 8 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: ic, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={props.icon} size={23} color={fg} />
        </div>
        {props.tag && <span className="tag" style={{ background: "rgba(255,255,255,.7)" }}>{props.tag}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div className="serif" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>
          {props.title}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--muted-2)" }}>{props.text}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: fg }}>
        Abrir <Icon name="arrow" size={16} color={fg} width={2} />
      </div>
    </>
  );
  return props.href ? (
    <Link href={props.href} style={style}>
      {body}
    </Link>
  ) : (
    <button style={style} onClick={() => say(soonMessage(props.soon ?? props.title))}>
      {body}
    </button>
  );
}

export function SoonButton({ label, module }: { label: string; module: string }) {
  const say = useToast();
  return (
    <button className="btn btn-dark" style={{ fontSize: 13, padding: "10px 16px" }} onClick={() => say(soonMessage(module))}>
      {label}
    </button>
  );
}
