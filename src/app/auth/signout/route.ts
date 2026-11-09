import { createClient } from "@/lib/supabase/server";
import { relativeRedirect } from "@/lib/relative-redirect";

export async function POST() {
  const supabase = await createClient();
  // scope "local": encerra só esta sessão; os cookies removidos seguem na resposta.
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  return relativeRedirect("/login", 303);
}
