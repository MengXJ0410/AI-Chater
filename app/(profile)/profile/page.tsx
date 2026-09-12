import { redirect } from "next/navigation";
import { ProfileClient } from "@/components/profile/profile-client";
import { getCurrentUser } from "@/server/security/auth";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ProfileClient initialUser={user} />;
}
