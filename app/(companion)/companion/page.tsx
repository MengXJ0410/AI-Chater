import { redirect } from "next/navigation";
import { CompanionClient } from "@/components/companion-client";
import { getCurrentUser } from "@/server/security/auth";

export const dynamic = "force-dynamic";

export default async function CompanionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <CompanionClient username={user.username} runtimeUrl={process.env.AIRI_STAGE_URL || "http://localhost:5173"} />;
}
