import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard";
import { getDefaultRouteForWorkspace } from "@/features/workspace/services/active-workspace";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // If user already has an active membership, skip onboarding
  const { data: membership } = await supabase
    .from("memberships")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (membership) {
    redirect(await getDefaultRouteForWorkspace(supabase, membership.workspace_id));
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <OnboardingWizard />
    </div>
  );
}
