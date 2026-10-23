import type { Metadata } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JusLegis — Inteligência jurídica",
  description: "Petições, análise de documentos e pesquisa em uma única plataforma.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${cormorant.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
