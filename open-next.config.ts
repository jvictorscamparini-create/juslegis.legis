import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Build do Next.js para Cloudflare Workers. Sem cache incremental (todas as rotas são dinâmicas).
export default defineCloudflareConfig();
