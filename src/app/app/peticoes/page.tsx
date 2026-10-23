import { requireUser } from "@/lib/auth";
import { isAiReady } from "@/lib/runtime";
import PetitionsView from "./PetitionsView";

export default async function PetitionsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { user } = await requireUser();
  const { id } = await searchParams;
  return <PetitionsView userId={user.id} aiReady={await isAiReady()} initialId={id ?? null} />;
}
