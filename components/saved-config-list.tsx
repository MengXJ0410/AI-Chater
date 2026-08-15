"use client";

import { FileImage, MessageSquare, Pencil, Play, Trash2 } from "lucide-react";
import { filterWorkspaceConfigs, formatMaskedApiKey, type SavedWorkspaceConfig, type WorkspaceConfigFilter } from "@/lib/workspace-configs";

export function SavedConfigList({ configs, filter, isLegacyMode, isLoading, error, activeChatPresetId, activeImagePresetId, onFilterChange, onUse, onEdit, onDelete }: {
  configs: SavedWorkspaceConfig[];
  filter: WorkspaceConfigFilter;
  isLegacyMode: boolean;
  isLoading: boolean;
  error: string;
  activeChatPresetId: string;
  activeImagePresetId: string;
  onFilterChange: (filter: WorkspaceConfigFilter) => void;
  onUse: (config: SavedWorkspaceConfig) => void;
  onEdit: (config: SavedWorkspaceConfig) => void;
  onDelete: (config: SavedWorkspaceConfig) => void;
}) {
  const visibleConfigs = filterWorkspaceConfigs(configs, filter);
  return <div className="saved-config-view">
    <div className="saved-config-filter" role="tablist" aria-label="配置类型筛选">
      {(["all", "chat", "image"] as const).map((item) => <button type="button" role="tab" aria-selected={filter === item} className={filter === item ? "is-active" : ""} onClick={() => onFilterChange(item)} key={item}>{item === "all" ? "全部" : item === "chat" ? "对话" : "生图"}</button>)}
    </div>
    {isLegacyMode ? <p className="saved-config-compatibility">当前服务端每类仅支持一条配置。多配置接口接入后，此列表会自动扩展。</p> : null}
    {error ? <p className="chat-form-error" role="alert">{error}</p> : null}
    {isLoading ? <div className="saved-config-empty" aria-live="polite">正在读取账号配置…</div> : null}
    {!isLoading && !visibleConfigs.length ? <div className="saved-config-empty"><strong>暂无已保存配置</strong><span>前往配置并保存后，会显示在这里。</span></div> : null}
    {!isLoading && visibleConfigs.length ? <div className="saved-config-list">
      {visibleConfigs.map((config) => {
        const Icon = config.kind === "chat" ? MessageSquare : FileImage;
        const isActive = config.kind === "chat" ? config.runtimePresetId === activeChatPresetId : config.runtimePresetId === activeImagePresetId;
        return <article className={`saved-config-card ${isActive ? "is-active" : ""}`} key={`${config.kind}:${config.id}`}>
          <header><span className="saved-config-kind"><Icon size={15} />{config.kind === "chat" ? "对话" : "生图"}</span>{isActive ? <span className="saved-config-active">当前使用</span> : null}</header>
          <div className="saved-config-title"><strong title={config.name}>{config.name}</strong><span title={config.model}>{config.model}</span></div>
          <dl><div><dt>Provider</dt><dd>{config.provider}</dd></div><div><dt>Base URL</dt><dd title={config.baseUrl}>{config.baseUrl}</dd></div><div><dt>API Key</dt><dd className="saved-config-secret" aria-label={`API Key 已保存，末四位 ${config.apiKeyLast4 || "未知"}`}>{config.apiKeyConfigured ? `已保存 · ${formatMaskedApiKey(config.apiKeyLast4)}` : "未配置"}</dd></div></dl>
          <footer><button className="chat-primary-button" type="button" onClick={() => onUse(config)}><Play size={14} fill="currentColor" />使用</button><button className="chat-secondary-button" type="button" onClick={() => onEdit(config)}><Pencil size={14} />编辑</button><button className="chat-icon-button saved-config-delete" type="button" aria-label={`删除 ${config.name}`} title="删除配置" onClick={() => onDelete(config)}><Trash2 size={15} /></button></footer>
        </article>;
      })}
    </div> : null}
  </div>;
}
