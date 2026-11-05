import { requireUser } from "@/lib/auth";
import CalculadorasClient from "./CalculadorasClient";

export const metadata = { title: "Calculadoras — JusLegis" };

export default async function CalculadorasPage() {
  await requireUser();
  return (
    <div style={{ padding: "32px 36px 40px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <div>
        <h1 className="h-page">Calculadoras</h1>
        <p className="sub">Honorários de sucumbência e contratuais, e estimativa de custas.</p>
      </div>
      <CalculadorasClient />
    </div>
  );
}
