import { requireUser } from "@/lib/auth";
import { searchUnavailableReason, type LegalScope } from "@/lib/legal-search";
import { loadAllSettings } from "@/lib/runtime";
import LegalSearchForm from "./LegalSearchForm";

export default async function LegalSearchScreen({ scope, title, sub, placeholder }: { scope: LegalScope; title: string; sub: string; placeholder: string }) {
  await requireUser();
  const settings = await loadAllSettings();

  return (
    <div style={{ padding: "32px clamp(16px,4vw,36px) 40px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <div>
        <h1 className="h-page">{title}</h1>
        <p className="sub">{sub}</p>
      </div>
      <LegalSearchForm scope={scope} placeholder={placeholder} unavailable={searchUnavailableReason(scope, settings)} />
    </div>
  );
}
