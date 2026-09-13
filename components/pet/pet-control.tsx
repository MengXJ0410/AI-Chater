"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { usePathname } from "next/navigation";
import { Bug, Download, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import {
  createSpiderPreset,
  DEFAULT_SPIDER_TUNING,
  defaultPetPreferences,
  dispatchPetChange,
  getSpiderTuning,
  mergeSpiderPresets,
  parsePetPreferences,
  parseSpiderPresets,
  PET_CHANGE_EVENT,
  PET_STORAGE_KEY,
  resetSpiderTuning,
  savePetPreferences,
  saveSpiderPresets,
  serializeSpiderPresets,
  SPIDER_PAIR_LABELS,
  SPIDER_PRESET_FILE_NAME,
  SPIDER_PRESET_STORAGE_KEY,
  SPIDER_TUNING_CHANGE_EVENT,
  updateSpiderTuning,
  type PetPreferences,
  type SpiderPairTuning,
  type SpiderPreset,
  type SpiderTuning,
} from "@/client/pet";

function TuneSlider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="appearance-slider">
      <span>{label} <output>{format ? format(value) : value}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function PetControl() {
  const pathname = usePathname();
  const [pet, setPet] = useState<PetPreferences>(defaultPetPreferences);
  const [tuning, setTuning] = useState<SpiderTuning>(DEFAULT_SPIDER_TUNING);
  const [pairIndex, setPairIndex] = useState(0);
  const [presets, setPresets] = useState<SpiderPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = parsePetPreferences(window.localStorage.getItem(PET_STORAGE_KEY));
    const savedPresets = parseSpiderPresets(window.localStorage.getItem(SPIDER_PRESET_STORAGE_KEY));
    void Promise.resolve().then(() => {
      setPet(saved);
      setTuning(getSpiderTuning());
      setPresets(savedPresets);
    });
    const handlePetChange = (event: Event) => {
      const detail = (event as CustomEvent<PetPreferences>).detail;
      if (detail && typeof detail === "object") setPet({ ...defaultPetPreferences, ...detail });
    };
    const handleTuningChange = (event: Event) => {
      const detail = (event as CustomEvent<SpiderTuning>).detail;
      if (detail && typeof detail === "object") setTuning(detail);
    };
    window.addEventListener(PET_CHANGE_EVENT, handlePetChange);
    window.addEventListener(SPIDER_TUNING_CHANGE_EVENT, handleTuningChange);
    return () => {
      window.removeEventListener(PET_CHANGE_EVENT, handlePetChange);
      window.removeEventListener(SPIDER_TUNING_CHANGE_EVENT, handleTuningChange);
    };
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

  function changePair(partial: Partial<SpiderPairTuning>) {
    const pairs = tuning.pairs.map((pair, index) => (index === pairIndex ? { ...pair, ...partial } : pair));
    setTuning(updateSpiderTuning({ pairs }));
  }

  function persistPresets(next: SpiderPreset[]) {
    setPresets(next);
    saveSpiderPresets(next);
  }

  function handleSavePreset() {
    persistPresets([...presets, createSpiderPreset(presetName, getSpiderTuning())]);
    setPresetName("");
  }

  function handleLoadPreset(preset: SpiderPreset) {
    setTuning(updateSpiderTuning(preset.tuning));
  }

  function handleDeletePreset(id: string) {
    persistPresets(presets.filter((preset) => preset.id !== id));
  }

  function handleExportPresets() {
    if (!presets.length) return;
    const blob = new Blob([serializeSpiderPresets(presets)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = SPIDER_PRESET_FILE_NAME;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportPresets(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parseSpiderPresets(await file.text());
      if (imported.length) persistPresets(mergeSpiderPresets(presets, imported));
    } catch {
      // 读取失败时保持现有预设
    }
  }

  if (pathname !== "/") return null;

  const pair = tuning.pairs[pairIndex] ?? DEFAULT_SPIDER_TUNING.pairs[0];

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
          <div className="appearance-panel-header"><span>足对参数 · {SPIDER_PAIR_LABELS[pairIndex]}</span></div>
          <div className="pet-pair-tabs" role="group" aria-label="选择足对">
            {SPIDER_PAIR_LABELS.map((label, index) => (
              <button className={index === pairIndex ? "is-selected" : ""} type="button" aria-pressed={index === pairIndex} key={label} onClick={() => setPairIndex(index)}>{label}</button>
            ))}
          </div>
          <TuneSlider label="股节" value={pair.femur} min={12} max={46} onChange={(femur) => changePair({ femur })} />
          <TuneSlider label="胫节" value={pair.tibia} min={14} max={52} onChange={(tibia) => changePair({ tibia })} />
          <TuneSlider label="跗节" value={pair.tarsus} min={6} max={32} onChange={(tarsus) => changePair({ tarsus })} />
          <TuneSlider label="朝向" value={pair.restAngle} min={-10} max={190} format={(value) => `${value}°`} onChange={(restAngle) => changePair({ restAngle })} />
          <TuneSlider label="髋部 X" value={pair.hipX} min={-12} max={12} step={0.5} onChange={(hipX) => changePair({ hipX })} />
          <TuneSlider label="髋部 Y" value={pair.hipY} min={1} max={12} step={0.5} onChange={(hipY) => changePair({ hipY })} />
          <TuneSlider label="步幅" value={pair.stride} min={0} max={0.6} step={0.01} format={(value) => value.toFixed(2)} onChange={(stride) => changePair({ stride })} />
          <TuneSlider label="跗节角度" value={pair.tarsusBend} min={-45} max={45} format={(value) => `${value}°`} onChange={(tarsusBend) => changePair({ tarsusBend })} />
          <button className={`appearance-pet-toggle ${pair.kneeFlip === -1 ? "is-active" : ""}`} type="button" aria-pressed={pair.kneeFlip === -1} onClick={() => changePair({ kneeFlip: pair.kneeFlip === -1 ? 1 : -1 })}>
            {pair.kneeFlip === -1 ? "弯曲镜像：开" : "弯曲镜像：关"}
          </button>

          <div className="appearance-divider" />
          <div className="appearance-panel-header"><span>全局姿态</span></div>
          <TuneSlider label="腿部伸展" value={tuning.restReach} min={0.3} max={0.9} step={0.01} format={(value) => value.toFixed(2)} onChange={(restReach) => changeTuning({ restReach })} />
          <TuneSlider label="抬脚阈值" value={tuning.stepReach} min={0.7} max={1} step={0.01} format={(value) => value.toFixed(2)} onChange={(stepReach) => changeTuning({ stepReach })} />
          <TuneSlider label="转身阈值" value={tuning.stepAngle} min={0.3} max={1.8} step={0.05} format={(value) => value.toFixed(2)} onChange={(stepAngle) => changeTuning({ stepAngle })} />
          <TuneSlider label="抬腿高度" value={tuning.legLift} min={2} max={16} format={(value) => `${value}px`} onChange={(legLift) => changeTuning({ legLift })} />
          <TuneSlider label="摆动时长" value={tuning.swingDuration} min={0.06} max={0.4} step={0.01} format={(value) => `${value.toFixed(2)}s`} onChange={(swingDuration) => changeTuning({ swingDuration })} />
          <TuneSlider label="基础步幅" value={tuning.stride} min={0} max={1} step={0.01} format={(value) => value.toFixed(2)} onChange={(stride) => changeTuning({ stride })} />
          <TuneSlider label="急转阈值" value={tuning.pivotAngle} min={0} max={3.14} step={0.02} format={(value) => value.toFixed(2)} onChange={(pivotAngle) => changeTuning({ pivotAngle })} />

          <div className="appearance-divider" />
          <div className="appearance-panel-header"><span>高速适应</span></div>
          <TuneSlider label="参考速度" value={tuning.gaitReference} min={40} max={400} step={5} format={(value) => `${value}`} onChange={(gaitReference) => changeTuning({ gaitReference })} />
          <TuneSlider label="收腿增益" value={tuning.swingSpeedGain} min={0} max={3} step={0.05} format={(value) => value.toFixed(2)} onChange={(swingSpeedGain) => changeTuning({ swingSpeedGain })} />
          <TuneSlider label="步幅增益" value={tuning.strideSpeedGain} min={0} max={3} step={0.05} format={(value) => value.toFixed(2)} onChange={(strideSpeedGain) => changeTuning({ strideSpeedGain })} />
          <TuneSlider label="转动增益" value={tuning.angleSpeedGain} min={0} max={3} step={0.05} format={(value) => value.toFixed(2)} onChange={(angleSpeedGain) => changeTuning({ angleSpeedGain })} />
          <TuneSlider label="转动上限" value={tuning.maxStepAngle} min={0.5} max={3.14} step={0.05} format={(value) => value.toFixed(2)} onChange={(maxStepAngle) => changeTuning({ maxStepAngle })} />

          <div className="appearance-divider" />
          <div className="appearance-panel-header"><span>步态协调</span></div>
          <TuneSlider label="波浪步长" value={tuning.waveStride} min={10} max={160} step={1} format={(value) => `${value}px`} onChange={(waveStride) => changeTuning({ waveStride })} />
          <TuneSlider label="抬脚窗口" value={tuning.waveWindow} min={0.1} max={1} step={0.05} format={(value) => value.toFixed(2)} onChange={(waveWindow) => changeTuning({ waveWindow })} />

          <div className="appearance-divider" />
          <div className="appearance-panel-header">
            <span>参数预设</span>
            <div className="appearance-actions">
              <button className="appearance-icon-button" data-tooltip="导出 JSON" type="button" aria-label="导出预设为 JSON 文件" disabled={!presets.length} onClick={handleExportPresets}><Download size={16} /></button>
              <button className="appearance-icon-button" data-tooltip="导入 JSON" type="button" aria-label="从 JSON 文件导入预设" onClick={() => importInputRef.current?.click()}><Upload size={16} /></button>
            </div>
          </div>
          <input className="appearance-file-input" ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportPresets} />
          <div className="pet-preset-save">
            <input type="text" value={presetName} placeholder="预设名称" aria-label="预设名称" onChange={(event) => setPresetName(event.target.value)} />
            <button className="appearance-icon-button" data-tooltip="保存当前为预设" type="button" aria-label="保存当前为预设" onClick={handleSavePreset}><Save size={16} /></button>
          </div>
          {presets.length ? (
            <div className="pet-preset-list">
              {presets.map((preset) => (
                <div className="pet-preset-row" key={preset.id}>
                  <button className="pet-preset-load" type="button" title="载入预设" onClick={() => handleLoadPreset(preset)}>{preset.name}</button>
                  <button className="appearance-icon-button" type="button" aria-label={`删除预设 ${preset.name}`} onClick={() => handleDeletePreset(preset.id)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          ) : <p className="pet-preset-empty">还没有预设</p>}
        </section>
      ) : null}
      <button className="appearance-trigger" data-tooltip="桌宠设置" type="button" aria-label="桌宠设置" aria-expanded={open} onClick={() => setOpen((current) => !current)}>🕷️</button>
    </div>
  );
}
