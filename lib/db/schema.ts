import { sql } from "drizzle-orm";
import {
  datetime,
  index,
  json,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  bigint,
} from "drizzle-orm/mysql-core";
import type { MessagePart } from "@/lib/messages";

const timestamps = {
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
};

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  deletedAt: datetime("deleted_at", { mode: "date" }),
  avatarStorageKey: varchar("avatar_storage_key", { length: 80 }),
  avatarMimeType: varchar("avatar_mime_type", { length: 80 }),
  avatarUpdatedAt: datetime("avatar_updated_at", { mode: "date" }),
  createdAt: timestamps.createdAt,
});

export const userAiConfigs = mysqlTable("user_ai_configs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionPresetId: varchar("connection_preset_id", { length: 64 }),
  name: varchar("name", { length: 80 }).notNull(),
  provider: mysqlEnum("provider", ["openai", "openai-compatible", "xai", "anthropic", "google"]).notNull(),
  baseUrl: varchar("base_url", { length: 512 }),
  model: varchar("model", { length: 160 }).notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyIv: varchar("api_key_iv", { length: 32 }).notNull(),
  apiKeyAuthTag: varchar("api_key_auth_tag", { length: 32 }).notNull(),
  encryptionKeyId: varchar("encryption_key_id", { length: 64 }).notNull(),
  apiKeyLast4: varchar("api_key_last4", { length: 4 }).notNull(),
  ...timestamps,
}, (table) => [index("user_ai_configs_user_updated_idx").on(table.userId, table.updatedAt)]);

export const userImageConfigs = mysqlTable("user_image_configs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  provider: mysqlEnum("provider", ["xai-compatible", "openai-compatible"]).notNull(),
  baseUrl: varchar("base_url", { length: 512 }).notNull(),
  model: varchar("model", { length: 160 }).notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyIv: varchar("api_key_iv", { length: 32 }).notNull(),
  apiKeyAuthTag: varchar("api_key_auth_tag", { length: 32 }).notNull(),
  encryptionKeyId: varchar("encryption_key_id", { length: 64 }).notNull(),
  apiKeyLast4: varchar("api_key_last4", { length: 4 }).notNull(),
  ...timestamps,
}, (table) => [index("user_image_configs_user_updated_idx").on(table.userId, table.updatedAt)]);

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamps.createdAt,
}, (table) => [index("sessions_user_id_idx").on(table.userId)]);

export const conversations = mysqlTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  ...timestamps,
}, (table) => [index("conversations_user_updated_idx").on(table.userId, table.updatedAt)]);

export const messages = mysqlTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  parts: json("parts").$type<MessagePart[]>().notNull(),
  presetId: varchar("preset_id", { length: 64 }),
  model: varchar("model", { length: 160 }),
  createdAt: timestamps.createdAt,
}, (table) => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt)]);

export const imageGenerations = mysqlTable("image_generations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  requestId: varchar("request_id", { length: 36 }).notNull(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userMessageId: varchar("user_message_id", { length: 36 }).notNull().references(() => messages.id, { onDelete: "cascade" }),
  assistantMessageId: varchar("assistant_message_id", { length: 36 }),
  imageConfigId: varchar("image_config_id", { length: 36 }).references(() => userImageConfigs.id, { onDelete: "set null" }),
  imagePresetId: varchar("image_preset_id", { length: 64 }).notNull(),
  provider: mysqlEnum("provider", ["xai-compatible", "openai-compatible"]).notNull(),
  model: varchar("model", { length: 160 }).notNull(),
  prompt: text("prompt").notNull(),
  aspectRatio: varchar("aspect_ratio", { length: 16 }).notNull(),
  resolution: mysqlEnum("resolution", ["1k", "2k"]).notNull(),
  quality: mysqlEnum("quality", ["low", "medium", "high"]).notNull(),
  source: mysqlEnum("source", ["image-mode"]).notNull(),
  status: mysqlEnum("status", ["queued", "running", "cancel_requested", "completed", "failed", "cancelled"]).notNull(),
  errorCode: varchar("error_code", { length: 64 }),
  startedAt: datetime("started_at", { mode: "date" }),
  completedAt: datetime("completed_at", { mode: "date" }),
  ...timestamps,
}, (table) => [
  index("image_generations_user_created_idx").on(table.userId, table.createdAt),
  index("image_generations_config_status_idx").on(table.imageConfigId, table.status),
  index("image_generations_queue_idx").on(table.status, table.createdAt),
  uniqueIndex("image_generations_user_request_unique").on(table.userId, table.requestId),
]);

export const modelConfigAuditEvents = mysqlTable("model_config_audit_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  configId: varchar("config_id", { length: 36 }),
  kind: mysqlEnum("kind", ["chat", "image"]).notNull(),
  action: mysqlEnum("action", ["created", "updated", "deleted", "tested", "generation_requested", "generation_completed", "generation_failed", "generation_cancelled", "rate_limited"]).notNull(),
  outcome: mysqlEnum("outcome", ["success", "failed", "rejected"]).notNull(),
  provider: varchar("provider", { length: 32 }),
  model: varchar("model", { length: 160 }),
  runtimePresetId: varchar("runtime_preset_id", { length: 64 }),
  requestId: varchar("request_id", { length: 64 }),
  errorCode: varchar("error_code", { length: 64 }),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("model_config_audit_user_created_idx").on(table.userId, table.createdAt),
  index("model_config_audit_config_created_idx").on(table.configId, table.createdAt),
]);

export const rateLimitStates = mysqlTable("rate_limit_states", {
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  scope: mysqlEnum("scope", ["config_mutation", "chat_test", "image_test", "image_generation"]).notNull(),
  windowStartedAt: datetime("window_started_at", { mode: "date" }).notNull(),
  count: int("count", { unsigned: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
}, (table) => [uniqueIndex("rate_limit_user_scope_unique").on(table.userId, table.scope)]);

export const attachments = mysqlTable("attachments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  messageId: varchar("message_id", { length: 36 }).references(() => messages.id, { onDelete: "cascade" }),
  storageKey: varchar("storage_key", { length: 80 }).notNull().unique(),
  mimeType: varchar("mime_type", { length: 80 }).notNull(),
  size: bigint("size", { mode: "number", unsigned: true }).notNull(),
  width: int("width", { unsigned: true }),
  height: int("height", { unsigned: true }),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  generationId: varchar("generation_id", { length: 36 }),
  origin: mysqlEnum("origin", ["upload", "generated"]).notNull().default("upload"),
  createdAt: timestamps.createdAt,
}, (table) => [
  index("attachments_user_id_idx").on(table.userId),
  index("attachments_message_id_idx").on(table.messageId),
  index("attachments_generation_id_idx").on(table.generationId),
]);
