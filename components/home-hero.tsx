"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, ChevronDown, Github, Image as ImageIcon, Layers3, LogOut, MessageSquareText, Settings2, WandSparkles } from "lucide-react";
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
import {
  clampHomePageIndex,
  getHomePageIndexFromScroll,
  HOME_PAGE_COUNT,
  nextHomePageIndex,
} from "@/lib/home-sections";

type HomeUser = { id: string; username: string } | null;

type PointerPosition = { x: number; y: number } | null;

const PAGE_LABELS = ["首页", "关于项目", "更多功能"];
const STAR_POINTS = [
  [8, 16, 1, 0], [17, 72, 2, 1.4], [26, 28, 1, 2.2], [34, 84, 1, 0.6], [43, 18, 2, 2.8],
  [51, 62, 1, 1.7], [61, 34, 1, 0.3], [68, 78, 2, 2.5], [77, 14, 1, 1.1], [86, 52, 1, 2.1],
  [93, 26, 2, 0.8], [12, 42, 1, 3.1], [31, 56, 1, 1.9], [57, 12, 1, 2.6], [73, 47, 1, 0.5],
  [89, 82, 1, 1.8], [5, 91, 1, 2.9], [47, 91, 2, 1.2], [81, 67, 1, 0.2], [64, 90, 1, 2.4],
] as const;
const METEOR_PATHS = [
  { left: "18%", top: "14%", delay: "0s", duration: "8.5s" },
  { left: "74%", top: "21%", delay: "3.2s", duration: "10s" },
  { left: "52%", top: "68%", delay: "6.4s", duration: "11.5s" },
] as const;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLElement | null>>([]);
  const wheelLockedRef = useRef(false);
  const wheelUnlockTimerRef = useRef<number | null>(null);
  const [activePage, setActivePage] = useState(0);

  const scrollToPage = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const shell = scrollRef.current;
    if (!shell) return;
    const pageIndex = clampHomePageIndex(index);
    const page = pageRefs.current[pageIndex];
    shell.scrollTo({ top: page?.offsetTop ?? pageIndex * shell.clientHeight, behavior });
    setActivePage(pageIndex);
  }, []);

  function handleHomeKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowDown" && event.key !== "PageDown" && event.key !== "ArrowUp" && event.key !== "PageUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" || event.key === "PageUp" ? -1 : 1;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToPage(nextHomePageIndex(activePage, direction), reducedMotion ? "auto" : "smooth");
  }

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

  useEffect(() => {
    const shell = scrollRef.current;
    if (!shell) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 8 || wheelLockedRef.current) return;
      const currentPage = getHomePageIndexFromScroll(shell.scrollTop, shell.clientHeight);
      const nextPage = nextHomePageIndex(currentPage, event.deltaY);
      if (nextPage === currentPage) return;
      event.preventDefault();
      wheelLockedRef.current = true;
      scrollToPage(nextPage, reducedMotion.matches ? "auto" : "smooth");
      wheelUnlockTimerRef.current = window.setTimeout(() => {
        wheelLockedRef.current = false;
      }, reducedMotion.matches ? 120 : 820);
    };
    shell.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      shell.removeEventListener("wheel", handleWheel);
      if (wheelUnlockTimerRef.current !== null) window.clearTimeout(wheelUnlockTimerRef.current);
    };
  }, [scrollToPage]);

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
    <main className="home-scroll-shell" ref={scrollRef} tabIndex={0} onKeyDown={handleHomeKeyDown} onScroll={(event) => setActivePage(getHomePageIndexFromScroll(event.currentTarget.scrollTop, event.currentTarget.clientHeight))}>
      <section className="home-page home-hero" ref={(element) => { pageRefs.current[0] = element; }} onPointerMove={movePointer} onPointerLeave={() => { pointerRef.current = null; }} aria-label="智能猫娘首页">
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
        <div className="home-stage" aria-label="智能猫娘">
          <div className="home-stage-content" ref={stageContentRef}>
            <h1>🥰智 能 猫 娘😋</h1>
            <Link className="home-launch" href={user ? "/chat" : "/login"}>👍🤓启动🤓👍</Link>
          </div>
        </div>
        <button className="home-explore-cue" type="button" onClick={() => scrollToPage(1)} aria-label="查看项目介绍"><span>向下探索</span><ChevronDown size={18} /></button>
      </section>

      <section className="home-page home-about" ref={(element) => { pageRefs.current[1] = element; }} aria-labelledby="home-about-title">
        <div className="home-about-stars" aria-hidden="true">
          {STAR_POINTS.map(([left, top, size, delay]) => <span className="home-star" style={{ left: `${left}%`, top: `${top}%`, width: `${size}px`, height: `${size}px`, animationDelay: `${delay}s` }} key={`${left}-${top}`} />)}
          {METEOR_PATHS.map((meteor) => <span className="home-meteor" style={{ left: meteor.left, top: meteor.top, animationDelay: meteor.delay, animationDuration: meteor.duration }} key={meteor.left} />)}
        </div>
        <div className="home-about-content">
          <div className="home-about-author">
            <span className="home-section-kicker">作者</span>
            <div className="home-author-mark"><Bot size={24} /></div>
            <h2>もNKI傑</h2>
            <p>———愿我们都能找到生活的意义。</p>
            <div className="home-author-links">
              <a href="https://github.com/MengXJ0410/AI-Chater" target="_blank" rel="noreferrer"><Github size={16} />GitHub<ArrowUpRight size={14} /></a>
              <span><MessageSquareText size={16} />B站链接待补充</span>
            </div>
          </div>
          <div className="home-about-project">
            <span className="home-section-kicker">关于 AI Chater</span>
            <h2 id="home-about-title">把模型能力，整理成一个顺手的工作台。</h2>
            <p className="home-project-lead">从一次对话开始，逐步连接模型、工具和未来的 Agent 能力。</p>
            <ul className="home-feature-list">
              <li><MessageSquareText size={18} /><span><strong>连续对话</strong><small>多会话、流式回复和历史记录。</small></span></li>
              <li><Layers3 size={18} /><span><strong>模型预设</strong><small>在不同模型和 Provider 之间切换。</small></span></li>
              <li><ImageIcon size={18} /><span><strong>多模态输入</strong><small>支持图片上传与视觉模型工作流。</small></span></li>
              <li><Settings2 size={18} /><span><strong>自定义体验</strong><small>主题色、背景和气泡互动都由你掌控。</small></span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="home-page home-placeholder" ref={(element) => { pageRefs.current[2] = element; }} aria-labelledby="home-placeholder-title">
        <div className="home-placeholder-content">
          <div className="home-placeholder-icon"><WandSparkles size={28} /></div>
          <span className="home-section-kicker">下一站</span>
          <h2 id="home-placeholder-title">更多功能即将开放</h2>
          <p>生图、视频和 Agent 工作流，会在这里逐步展开。</p>
        </div>
      </section>

      <nav className="home-page-dots" aria-label="首页分页">
        {PAGE_LABELS.slice(0, HOME_PAGE_COUNT).map((label, index) => <button className={activePage === index ? "is-active" : ""} type="button" aria-label={`前往${label}`} aria-current={activePage === index ? "page" : undefined} onClick={() => scrollToPage(index)} key={label}><span>{String(index + 1).padStart(2, "0")}</span>{label}</button>)}
      </nav>
    </main>
  );
}
