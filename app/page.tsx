import { HomeHero } from "@/components/home-hero";
import { getCurrentUser } from "@/lib/auth";
import { getHomeBackgrounds } from "@/lib/home-backgrounds";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, backgrounds] = await Promise.all([getCurrentUser(), getHomeBackgrounds()]);
  return <HomeHero user={user} backgrounds={backgrounds} />;
}
