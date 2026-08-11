import { redirect } from "next/navigation";
import { ChatClient } from "@/components/chat-client";
import { getCurrentUser } from "@/lib/auth";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ChatClient user={user} />;
}
