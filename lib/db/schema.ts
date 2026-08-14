import { sql } from "drizzle-orm";
import {
  datetime,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
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
  createdAt: timestamps.createdAt,
});

export const userAiConfigs = mysqlTable("user_ai_configs", {
  userId: varchar("user_id", { length: 36 }).primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: mysqlEnum("provider", ["openai", "openai-compatible", "xai", "anthropic", "google"]).notNull(),
  baseUrl: varchar("base_url", { length: 512 }),
  model: varchar("model", { length: 160 }).notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyIv: varchar("api_key_iv", { length: 32 }).notNull(),
  apiKeyAuthTag: varchar("api_key_auth_tag", { length: 32 }).notNull(),
  encryptionKeyId: varchar("encryption_key_id", { length: 64 }).notNull(),
  apiKeyLast4: varchar("api_key_last4", { length: 4 }).notNull(),
  ...timestamps,
});

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

export const attachments = mysqlTable("attachments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  messageId: varchar("message_id", { length: 36 }).references(() => messages.id, { onDelete: "cascade" }),
  storageKey: varchar("storage_key", { length: 80 }).notNull().unique(),
  mimeType: varchar("mime_type", { length: 80 }).notNull(),
  size: bigint("size", { mode: "number", unsigned: true }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  createdAt: timestamps.createdAt,
}, (table) => [
  index("attachments_user_id_idx").on(table.userId),
  index("attachments_message_id_idx").on(table.messageId),
]);
