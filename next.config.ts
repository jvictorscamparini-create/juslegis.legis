import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Só vale para `next dev`. O Next 16 bloqueia o JS de desenvolvimento pedido por um host diferente
// daquele em que o servidor subiu; sem isso a página não hidrata e nenhum botão responde.
// Entradas específicas, nunca curingas amplos. Prévia do AI Studio + extras via DEV_ALLOWED_ORIGINS
// (hostnames separados por vírgula, sem https:// e sem porta), para quando o AI Studio trocar o host.
const AI_STUDIO_PREVIEW_HOST = "ais-dev-trzrt6fqt6r6p4kw7ge5ca-11456040753.us-east5.run.app";
const allowedDevOrigins = [
  AI_STUDIO_PREVIEW_HOST,
  ...(process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host && !host.includes("/") && !host.includes("*")),
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  poweredByHeader: false,
  experimental: process.env.SKIP_NEXT_TYPECHECK === "1" ? { cpus: 1 } : {},
  // Somente para máquinas com pouca memória: rode "npm run typecheck" separadamente. Na Vercel o typecheck do build permanece ativo.
  typescript: { ignoreBuildErrors: process.env.SKIP_NEXT_TYPECHECK === "1" },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
