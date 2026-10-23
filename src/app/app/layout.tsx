import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { isAdminProfile, requireUser } from "@/lib/auth";
import { loadAccess, loadPublicSettings } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const PLAN_LABEL = { subscription: "Assinatura ativa", trial: "Teste gratuito", expired: "Teste encerrado" } as const;

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await requireUser();
  const settings = await loadPublicSettings(supabase);
  const access = await loadAccess(supabase, user.id, profile?.created_at ?? user.created_at, settings.trial.days);

  return (
    <WorkspaceShell user={{ email: user.email ?? "", isAdmin: isAdminProfile(profile), planLabel: PLAN_LABEL[access.kind] }}>
      {children}
    </WorkspaceShell>
  );
}
