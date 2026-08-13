"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { pickAiTerms } from "@/lib/ai-terms";
import {
  APPEARANCE_CHANGE_EVENT,
  DEFAULT_ACCENT,
  defaultAppearance,
  deriveBubbleColor,
  type AppearanceChangeDetail,
} from "@/lib/appearance";
import {
  advanceParticles,
  createBubbleVisuals,
  placeBubbleParticles,
  type BubbleParticle,
  type BubbleRect,
  type BubbleVisual,
} from "@/lib/home-bubbles";

type HomeUser = { id: string; username: string } | null;

type PointerPosition = { x: number; y: number } | null;

export function HomeHero({ backgrounds, user }: { backgrounds: string[]; user: HomeUser }) {
  const router = useRouter();
  const [activeBackground, setActiveBackground] = useState(0);
  const [bubbles, setBubbles] = useState<BubbleVisual[]>([]);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [bubbleColorRange, setBubbleColorRange] = useState(defaultAppearance.bubbleColorRange);
  const activityRef = useRef(defaultAppearance.bubbleActivity);
  const fieldRef = useRef<HTMLDivElement>(null);
  const stageContentRef = useRef<HTMLDivElement>(null);
  const bubbleElementsRef = useRef(new Map<string, HTMLDivElement>());
  const particlesRef = useRef<BubbleParticle[]>([]);
  const pointerRef = useRef<PointerPosition>(null);

  useEffect(() => {
    void Promise.resolve().then(() => setBubbles(createBubbleVisuals(pickAiTerms(6))));
  }, []);

  useEffect(() => {
    const updateAccent = (event: Event) => {
      const detail = (event as CustomEvent<AppearanceChangeDetail>).detail;
      setAccent(detail.accent);
      setBubbleColorRange(detail.bubbleColorRange);
      activityRef.current = detail.bubbleActivity;
    };
    window.addEventListener(APPEARANCE_CHANGE_EVENT, updateAccent);
    return () => window.removeEventListener(APPEARANCE_CHANGE_EVENT, updateAccent);
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    const stageContent = stageContentRef.current;
    if (!field || !stageContent || bubbles.length === 0) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previousTime = performance.now();
    let bounds = { width: field.clientWidth, height: field.clientHeight, padding: 12 };
    let safeRect: BubbleRect = { left: 0, top: 0, right: 0, bottom: 0 };

    function measureAndPlace() {
      const fieldBounds = field!.getBoundingClientRect();
      const contentBounds = stageContent!.getBoundingClientRect();
      bounds = { width: fieldBounds.width, height: fieldBounds.height, padding: fieldBounds.width <= 700 ? 8 : 14 };
      safeRect = {
        left: contentBounds.left - fieldBounds.left - 34,
        top: contentBounds.top - fieldBounds.top - 28,
        right: contentBounds.right - fieldBounds.left + 34,
        bottom: contentBounds.bottom - fieldBounds.top + 34,
      };
      particlesRef.current = placeBubbleParticles(bubbles, bounds, safeRect);
      drawParticles();
    }

    function drawParticles() {
      for (const particle of particlesRef.current) {
        const element = bubbleElementsRef.current.get(particle.id);
        if (!element) continue;
        const pointer = pointerRef.current;
        const pointerDistance = pointer ? Math.hypot(particle.x - pointer.x, particle.y - pointer.y) : Number.POSITIVE_INFINITY;
        const proximity = Math.max(0, 1 - pointerDistance / (particle.radius + 125));
        const activity = activityRef.current / 100;
        element.style.setProperty("--bubble-x", `${particle.x}px`);
        element.style.setProperty("--bubble-y", `${particle.y}px`);
        element.style.setProperty("--bubble-size", `${particle.size}px`);
        element.style.setProperty("--squash-x", String(1 - particle.squash * activity));
        element.style.setProperty("--squash-y", String(1 + particle.squash * activity * 0.72));
        element.style.setProperty("--squash-angle", `${particle.squashAngle}rad`);
        element.style.setProperty("--pointer-scale", String(1 + proximity * activity * 0.05));
        element.style.setProperty("--pointer-light", String(proximity * activity));
        element.style.setProperty("--bubble-ready", "1");
      }
    }

    function animate(time: number) {
      const elapsed = (time - previousTime) / 1000;
      previousTime = time;
      if (!document.hidden) {
        const activity = activityRef.current / 100;
        const pointer = pointerRef.current;
        if (pointer && activity > 0) {
          for (const particle of particlesRef.current) {
            const dx = particle.x - pointer.x;
            const dy = particle.y - pointer.y;
            const distance = Math.hypot(dx, dy);
            const influence = particle.radius + 112;
            if (distance > 0 && distance < influence) {
              const force = (1 - distance / influence) * (20 + 34 * activity) * Math.min(elapsed, 0.05);
              particle.vx += (dx / distance) * force;
              particle.vy += (dy / distance) * force;
            }
          }
        }
        if (activity > 0) advanceParticles(particlesRef.current, elapsed * (0.45 + activity * 1.1), bounds, safeRect);
        drawParticles();
      }
      frame = window.requestAnimationFrame(animate);
    }

    const resizeObserver = new ResizeObserver(measureAndPlace);
    resizeObserver.observe(field);
    resizeObserver.observe(stageContent);
    measureAndPlace();
    if (!reducedMotion.matches) frame = window.requestAnimationFrame(animate);
    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [bubbles]);

  useEffect(() => {
    if (backgrounds.length < 2) return;
    const interval = window.setInterval(() => {
      setActiveBackground((current) => (current + 1) % backgrounds.length);
    }, 9000);
    return () => window.clearInterval(interval);
  }, [backgrounds.length]);

  function movePointer(event: React.PointerEvent<HTMLElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = fieldRef.current?.getBoundingClientRect();
    if (!bounds) return;
    pointerRef.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <main className="home-hero" onPointerMove={movePointer} onPointerLeave={() => { pointerRef.current = null; }}>
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
      <div className="home-bubble-field" ref={fieldRef} aria-hidden="true">
        {bubbles.map((bubble) => {
          const color = deriveBubbleColor(accent, bubble, bubbleColorRange);
          const style = {
            "--bubble-size": `${bubble.size}px`,
            "--bubble-gradient": `linear-gradient(${bubble.gradientAngle}deg, color-mix(in srgb, ${color.primary} 68%, transparent), color-mix(in srgb, ${color.secondary} 62%, transparent))`,
            "--bubble-text": color.text,
          } as CSSProperties;
          return (
            <div className="home-bubble-float" ref={(element) => { if (element) bubbleElementsRef.current.set(bubble.id, element); else bubbleElementsRef.current.delete(bubble.id); }} style={style} key={bubble.id}>
              <div className="home-bubble"><span className="home-bubble-label">{bubble.term}</span></div>
            </div>
          );
        })}
      </div>
      <section className="home-stage" aria-label="智能猫娘">
        <div className="home-stage-content" ref={stageContentRef}>
          <h1>🥰智 能 猫 娘😋</h1>
          <Link className="home-launch" href={user ? "/chat" : "/register"}>👍🤓启动🤓👍</Link>
        </div>
      </section>
    </main>
  );
}
