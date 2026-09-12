"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import {
  createSpiderState,
  defaultPetPreferences,
  getSpiderTuning,
  parsePetPreferences,
  PET_CHANGE_EVENT,
  PET_STORAGE_KEY,
  poseSpider,
  SPIDER_ABDOMEN_OFFSET,
  SPIDER_LEGS,
  SPIDER_TUNING_CHANGE_EVENT,
  stepSpider,
  type PetPreferences,
  type Point,
  type SpiderState,
} from "@/client/pet";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function SpiderPet() {
  const pathname = usePathname();
  const [preferences, setPreferences] = useState<PetPreferences>(defaultPetPreferences);
  const preferencesRef = useRef(preferences);
  const stateRef = useRef<SpiderState | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const femurRefs = useRef<Array<SVGPathElement | null>>([]);
  const tibiaRefs = useRef<Array<SVGPathElement | null>>([]);
  const tarsusRefs = useRef<Array<SVGPathElement | null>>([]);
  const footRefs = useRef<Array<SVGCircleElement | null>>([]);
  const pointerRef = useRef<Point | null>(null);
  const draggingRef = useRef(false);
  const pressRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const wakeRef = useRef(false);
  const clickTimesRef = useRef<number[]>([]);
  const chaseTriggerRef = useRef(false);

  useEffect(() => {
    const saved = parsePetPreferences(window.localStorage.getItem(PET_STORAGE_KEY));
    void Promise.resolve().then(() => setPreferences(saved));
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<PetPreferences>).detail;
      if (detail && typeof detail === "object") setPreferences({ ...defaultPetPreferences, ...detail });
    };
    window.addEventListener(PET_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(PET_CHANGE_EVENT, handleChange);
  }, []);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    if (pathname !== "/" || preferences.kind !== "spider") return;
    const layer = layerRef.current;
    if (!layer) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    let viewport = { width: window.innerWidth, height: window.innerHeight };
    const state = createSpiderState(viewport);
    stateRef.current = state;

    const draw = () => {
      const current = stateRef.current;
      if (!current) return;
      const poses = poseSpider(current);
      for (const leg of SPIDER_LEGS) {
        const pose = poses[leg.index];
        const femur = femurRefs.current[leg.index];
        const tibia = tibiaRefs.current[leg.index];
        const tarsus = tarsusRefs.current[leg.index];
        const foot = footRefs.current[leg.index];
        if (femur) femur.setAttribute("d", `M${pose.hip.x.toFixed(1)} ${pose.hip.y.toFixed(1)}L${pose.knee.x.toFixed(1)} ${pose.knee.y.toFixed(1)}`);
        if (tibia) tibia.setAttribute("d", `M${pose.knee.x.toFixed(1)} ${pose.knee.y.toFixed(1)}L${pose.ankle.x.toFixed(1)} ${pose.ankle.y.toFixed(1)}`);
        if (tarsus) tarsus.setAttribute("d", `M${pose.ankle.x.toFixed(1)} ${pose.ankle.y.toFixed(1)}L${pose.foot.x.toFixed(1)} ${pose.foot.y.toFixed(1)}`);
        if (foot) {
          foot.setAttribute("cx", pose.foot.x.toFixed(1));
          foot.setAttribute("cy", pose.foot.y.toFixed(1));
          foot.setAttribute("opacity", (1 - (pose.lift / (getSpiderTuning().legLift || 1)) * 0.6).toFixed(2));
        }
      }
      const headingDeg = (current.heading * 180) / Math.PI + Math.sin(current.legPhase * 1.6) * 1.2;
      if (bodyRef.current) {
        bodyRef.current.setAttribute(
          "transform",
          `translate(${current.x.toFixed(1)} ${current.y.toFixed(1)}) rotate(${headingDeg.toFixed(2)})`,
        );
      }
      layer.style.setProperty("--spider-ready", "1");
    };

    const stepOnce = (elapsedMs: number) => {
      const current = stateRef.current;
      if (!current) return;
      const next = stepSpider(current, {
        viewport,
        pointer: pointerRef.current,
        dragging: draggingRef.current,
        activity: coarsePointer ? preferencesRef.current.activity * 0.6 : preferencesRef.current.activity,
        chaseCursor: preferencesRef.current.chaseCursor && !coarsePointer,
        chaseTrigger: chaseTriggerRef.current,
        wake: wakeRef.current,
        elapsedMs,
        random: Math.random,
      });
      wakeRef.current = false;
      chaseTriggerRef.current = false;
      stateRef.current = next;
      draw();
    };

    const onWindowPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const now = performance.now();
      const recent = clickTimesRef.current.filter((time) => now - time < 1000);
      recent.push(now);
      if (recent.length >= 5) {
        chaseTriggerRef.current = true;
        clickTimesRef.current = [];
      } else {
        clickTimesRef.current = recent;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (pressRef.current && !draggingRef.current) {
        if (Math.hypot(event.clientX - pressRef.current.x, event.clientY - pressRef.current.y) > 6) {
          pressRef.current.moved = true;
          draggingRef.current = true;
          wakeRef.current = true;
        }
      }
      if (reducedMotion && draggingRef.current) stepOnce(0);
    };

    const onPointerUp = () => {
      const press = pressRef.current;
      pressRef.current = null;
      if (draggingRef.current) {
        draggingRef.current = false;
        wakeRef.current = true;
      }
      if (reducedMotion && press) stepOnce(0);
    };

    const onResize = () => {
      viewport = { width: window.innerWidth, height: window.innerHeight };
      const current = stateRef.current;
      if (current) {
        stateRef.current = {
          ...current,
          x: clamp(current.x, 0, viewport.width),
          y: clamp(current.y, 0, viewport.height),
        };
      }
      if (reducedMotion) draw();
    };

    const onTuningChange = () => draw();

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onWindowPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onResize);
    window.addEventListener(SPIDER_TUNING_CHANGE_EVENT, onTuningChange);

    let frame = 0;
    let previous = performance.now();
    const loop = (time: number) => {
      const elapsed = time - previous;
      previous = time;
      if (!document.hidden) stepOnce(elapsed);
      frame = window.requestAnimationFrame(loop);
    };

    draw();
    if (!reducedMotion) frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onWindowPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onResize);
      window.removeEventListener(SPIDER_TUNING_CHANGE_EVENT, onTuningChange);
      draggingRef.current = false;
      pressRef.current = null;
      clickTimesRef.current = [];
      chaseTriggerRef.current = false;
      stateRef.current = null;
    };
  }, [pathname, preferences.kind]);

  function handleBodyPointerDown(event: ReactPointerEvent<SVGGElement>) {
    pointerRef.current = { x: event.clientX, y: event.clientY };
    pressRef.current = { x: event.clientX, y: event.clientY, moved: false };
    wakeRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  if (pathname !== "/" || preferences.kind !== "spider") return null;

  return (
    <div className="spider-pet" ref={layerRef} aria-hidden="true">
      <svg className="spider-pet-svg" xmlns="http://www.w3.org/2000/svg">
        <g className="spider-pet-legs">
          {SPIDER_LEGS.map((leg) => (
            <g key={leg.index}>
              <path className="spider-pet-femur" ref={(element) => { femurRefs.current[leg.index] = element; }} />
              <path className="spider-pet-tibia" ref={(element) => { tibiaRefs.current[leg.index] = element; }} />
              <path className="spider-pet-tarsus" ref={(element) => { tarsusRefs.current[leg.index] = element; }} />
              <circle className="spider-pet-foot" r={1.9} ref={(element) => { footRefs.current[leg.index] = element; }} />
            </g>
          ))}
        </g>
        <g className="spider-pet-body" ref={bodyRef} onPointerDown={handleBodyPointerDown}>
          <line className="spider-pet-chelicera" x1={20} y1={-3} x2={26} y2={-4} />
          <line className="spider-pet-chelicera" x1={20} y1={3} x2={26} y2={4} />
          <ellipse className="spider-pet-abdomen" cx={-SPIDER_ABDOMEN_OFFSET} cy={0} rx={20} ry={15} />
          <ellipse className="spider-pet-cephalo" cx={6} cy={0} rx={13} ry={11} />
          <circle className="spider-pet-eye" cx={14} cy={-4.5} r={1.7} />
          <circle className="spider-pet-eye" cx={14} cy={4.5} r={1.7} />
          <circle className="spider-pet-eye" cx={11} cy={-7} r={1.2} />
          <circle className="spider-pet-eye" cx={11} cy={7} r={1.2} />
        </g>
      </svg>
    </div>
  );
}
