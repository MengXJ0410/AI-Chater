"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, PointerEvent, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { pickAiTerms } from "@/lib/ai-terms";

type HomeUser = { id: string; username: string } | null;

type Bubble = {
  id: string;
  term: string;
  x: number;
  y: number;
  delay: number;
  duration: number;
};

type PointerPosition = { x: number; y: number } | null;

function createBubbles() {
  return pickAiTerms(10).map((term, index) => {
    let x = 0;
    let y = 0;
    do {
      x = 7 + Math.random() * 86;
      y = 10 + Math.random() * 80;
    } while (x > 27 && x < 73 && y > 24 && y < 76);

    return {
      id: `${term}-${index}`,
      term,
      x,
      y,
      delay: -Math.random() * 9,
      duration: 7 + Math.random() * 5,
    };
  });
}

function bubbleRepulsion(bubble: Bubble, pointer: PointerPosition) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return { x: 0, y: 0 };
  if (!pointer) return { x: 0, y: 0 };
  const x = bubble.x - pointer.x;
  const y = bubble.y - pointer.y;
  const distance = Math.hypot(x, y);
  const radius = 17;
  if (distance === 0 || distance >= radius) return { x: 0, y: 0 };
  const force = ((radius - distance) / radius) * 42;
  return { x: (x / distance) * force, y: (y / distance) * force };
}

export function HomeHero({ backgrounds, user }: { backgrounds: string[]; user: HomeUser }) {
  const router = useRouter();
  const [activeBackground, setActiveBackground] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [pointer, setPointer] = useState<PointerPosition>(null);

  useEffect(() => {
    void Promise.resolve().then(() => setBubbles(createBubbles()));
  }, []);

  useEffect(() => {
    if (backgrounds.length < 2) return;
    const interval = window.setInterval(() => {
      setActiveBackground((current) => (current + 1) % backgrounds.length);
    }, 9000);
    return () => window.clearInterval(interval);
  }, [backgrounds.length]);

  function movePointer(event: PointerEvent<HTMLElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <main className="home-hero" onPointerMove={movePointer} onPointerLeave={() => setPointer(null)}>
      <div className="home-backgrounds" aria-hidden="true">
        {backgrounds.map((background, index) => <div className={`home-background-layer ${index === activeBackground ? "is-active" : ""}`} style={{ backgroundImage: `url(${background})` }} key={background} />)}
      </div>
      <div className="home-scrim" aria-hidden="true" />
      <header className="home-nav">
        {user ? (
          <div className="home-user-actions">
            <span className="home-username">{user.username}</span>
            <button className="home-logout" type="button" aria-label="退出登录" title="退出登录" onClick={logout}><LogOut size={17} /></button>
          </div>
        ) : (
          <nav className="home-guest-actions" aria-label="认证入口">
            <Link className="home-register" href="/register">注册</Link>
            <Link className="home-login" href="/login">登陆</Link>
          </nav>
        )}
      </header>
      <div className="home-bubble-field" aria-hidden="true">
        {bubbles.map((bubble) => {
          const repel = bubbleRepulsion(bubble, pointer);
          const style = {
            left: `${bubble.x}%`,
            top: `${bubble.y}%`,
            animationDelay: `${bubble.delay}s`,
            animationDuration: `${bubble.duration}s`,
            "--repel-x": `${repel.x}px`,
            "--repel-y": `${repel.y}px`,
          } as CSSProperties;
          return <div className="home-bubble-float" style={style} key={bubble.id}><span className="home-bubble">{bubble.term}</span></div>;
        })}
      </div>
      <section className="home-stage" aria-label="智能猫娘">
        <h1>🥰智 能 猫 娘😋</h1>
        <Link className="home-launch" href={user ? "/chat" : "/register"}>👍🤓启动🤓👍</Link>
      </section>
    </main>
  );
}
