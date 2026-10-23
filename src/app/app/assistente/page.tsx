import { requireUser } from "@/lib/auth";
import { isAiReady, loadPublicSettings } from "@/lib/runtime";
import AssistantView from "./AssistantView";

export default async function AssistantPage() {
  const { supabase, user } = await requireUser();
  const [aiReady, settings] = await Promise.all([isAiReady(), loadPublicSettings(supabase)]);
  return <AssistantView userId={user.id} aiReady={aiReady} enabled={settings.features.assistant} />;
}
