"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, RotateCcw } from "lucide-react";
import {
  DEFAULT_SPIDER_TUNING,
  defaultPetPreferences,
  dispatchPetChange,
  getSpiderTuning,
  parsePetPreferences,
  PET_CHANGE_EVENT,
  PET_STORAGE_KEY,
  resetSpiderTuning,
  savePetPreferences,
  SPIDER_TUNING_CHANGE_EVENT,
  updateSpiderTuning,
  type PetPreferences,
  type SpiderTuning,
} from "@/client/pet";

export function PetControl() {
  const pathname = usePathname();
  const [pet, setPet] = useState<PetPreferences>(defaultPetPreferences);
  const [tuning, setTuning] = useState<SpiderTuning>(DEFAULT_SPIDER_TUNING);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = parsePetPreferences(window.localStorage.getItem(PET_STORAGE_KEY));
    void Promise.resolve().then(() => setPet(saved));
    const handlePetChange = (event: Event) => {
      const detail = (event as CustomEvent<PetPreferences>).detail;
      if (detail && typeof detail === "object") setPet({ ...defaultPetPreferences, ...detail });
    };
    window.addEventListener(PET_CHANGE_EVENT, handlePetChange);
    return () => window.removeEventListener(PET_CHANGE_EVENT, handlePetChange);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => setTuning(getSpiderTuning()));
    const handleTuningChange = (event: Event) => {
      const detail = (event as CustomEvent<SpiderTuning>).detail;
      if (detail && typeof detail === "object") setTuning(detail);
    };
    window.addEventListener(SPIDER_TUNING_CHANGE_EVENT, handleTuningChange);
    return () => window.removeEventListener(SPIDER_TUNING_CHANGE_EVENT, handleTuningChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function savePet(next: PetPreferences) {
    const normalized = { ...defaultPetPreferences, ...next };
    setPet(normalized);
    try {
      savePetPreferences(normalized);
    } catch {
      // 存储不可用时仍然应用本次设置
    }
    dispatchPetChange(normalized);
  }

  function changeTuning(partial: Partial<SpiderTuning>) {
    setTuning(updateSpiderTuning(partial));
  }

  if (pathname !== "/") return null;

  return (
    <div className="pet-control" ref={rootRef}>
      {open ? (
        <section className="appearance-panel pet-panel" aria-label="桌宠设置">
          <div className="appearance-panel-header">
            <span>桌面宠物</span>
            <button className="appearance-icon-button" data-tooltip="恢复默认姿态" type="button" aria-label="恢复默认姿态" onClick={() => setTuning(resetSpiderTuning())}><RotateCcw size={16} /></button>
          </div>
          <button className={`appearance-pet-toggle ${pet.kind ? "is-active" : ""}`} type="button" aria-pressed={pet.kind === "spider"} onClick={() => savePet({ ...pet, kind: pet.kind ? null : "spider" })}>
            <Bug size={16} />
            {pet.kind ? "收回宠物" : "召唤宠物"}
          </button>
          <label className="appearance-slider">
            <span>活跃度 <output>{pet.activity}%</output></span>
            <input type="range" min="0" max="200" step="5" value={pet.activity} onChange={(event) => savePet({ ...pet, activity: Number(event.target.value) })} />
          </label>
          <label className="appearance-pet-chase">
            <input type="checkbox" checked={pet.chaseCursor} onChange={(event) => savePet({ ...pet, chaseCursor: event.target.checked })} />
            <span>允许追击</span>
          </label>

          <div className="appearance-divider" />
          <div className="appearance-panel-header"><span>身体姿态</span></div>
          <label className="appearance-slider">
            <span>腿部伸展 <output>{tuning.restReach.toFixed(2)}</output></span>
            <input type="range" min="0.4" max="0.9" step="0.01" value={tuning.restReach} onChange={(event) => changeTuning({ restReach: Number(event.target.value) })} />
          </label>
          <label className="appearance-slider">
            <span>跗节角度 <output>{tuning.tarsusBend}°</output></span>
            <input type="range" min="-40" max="40" step="1" value={tuning.tarsusBend} onChange={(event) => changeTuning({ tarsusBend: Number(event.target.value) })} />
          </label>
          <label className="appearance-slider">
            <span>抬腿高度 <output>{tuning.legLift}px</output></span>
            <input type="range" min="2" max="14" step="1" value={tuning.legLift} onChange={(event) => changeTuning({ legLift: Number(event.target.value) })} />
          </label>
          <label className="appearance-slider">
            <span>步幅 <output>{tuning.stride.toFixed(2)}</output></span>
            <input type="range" min="0.1" max="0.5" step="0.01" value={tuning.stride} onChange={(event) => changeTuning({ stride: Number(event.target.value) })} />
          </label>
          <button className={`appearance-pet-toggle ${tuning.kneeFlip === -1 ? "is-active" : ""}`} type="button" aria-pressed={tuning.kneeFlip === -1} onClick={() => changeTuning({ kneeFlip: tuning.kneeFlip === -1 ? 1 : -1 })}>
            {tuning.kneeFlip === -1 ? "弯曲镜像：开" : "弯曲镜像：关"}
          </button>
        </section>
      ) : null}
      <button className="appearance-trigger" data-tooltip="桌宠设置" type="button" aria-label="桌宠设置" aria-expanded={open} onClick={() => setOpen((current) => !current)}>🕷️</button>
    </div>
  );
}
