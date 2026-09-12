import { HomeHero } from "@/components/home/home-hero";
import { getCurrentUser } from "@/server/security/auth";
import { getHomeBackgrounds } from "@/server/services/home-backgrounds";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, backgrounds] = await Promise.all([getCurrentUser(), getHomeBackgrounds()]);
  return <HomeHero user={user} backgrounds={backgrounds} />;
}
