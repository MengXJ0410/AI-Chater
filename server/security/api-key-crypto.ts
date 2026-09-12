import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

type EncryptionKeyring = {
  activeKeyId: string;
  keys: Map<string, Buffer>;
};

export type EncryptedApiKey = {
  apiKeyCiphertext: string;
  apiKeyIv: string;
  apiKeyAuthTag: string;
  encryptionKeyId: string;
};

function decodeEncryptionKey(value: string, label: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error(`${label} 必须是 32 字节 Base64 密钥。`);
  return key;
}

function getEncryptionKeyring(): EncryptionKeyring {
  const singleKey = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (singleKey) return { activeKeyId: "default", keys: new Map([["default", decodeEncryptionKey(singleKey, "AI_CONFIG_ENCRYPTION_KEY")]]) };

  const raw = process.env.AI_CONFIG_ENCRYPTION_KEYS;
  const activeKeyId = process.env.AI_CONFIG_ACTIVE_KEY_ID;
  if (!raw || !activeKeyId) throw new Error("未配置 AI_CONFIG_ENCRYPTION_KEY。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI_CONFIG_ENCRYPTION_KEYS 必须是 JSON 对象。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI_CONFIG_ENCRYPTION_KEYS 必须是 JSON 对象。");
  const keys = new Map<string, Buffer>();
  for (const [keyId, value] of Object.entries(parsed)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId) || typeof value !== "string") throw new Error("AI_CONFIG_ENCRYPTION_KEYS 包含无效 key id 或值。");
    keys.set(keyId, decodeEncryptionKey(value, `AI_CONFIG_ENCRYPTION_KEYS.${keyId}`));
  }
  if (!keys.has(activeKeyId)) throw new Error("AI_CONFIG_ACTIVE_KEY_ID 未在密钥环中定义。");
  return { activeKeyId, keys };
}

export function getActiveEncryptionKeyId() {
  return getEncryptionKeyring().activeKeyId;
}

export function encryptApiKey(apiKey: string): EncryptedApiKey {
  const keyring = getEncryptionKeyring();
  const key = keyring.keys.get(keyring.activeKeyId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    apiKeyCiphertext: ciphertext.toString("base64url"),
    apiKeyIv: iv.toString("base64url"),
    apiKeyAuthTag: cipher.getAuthTag().toString("base64url"),
    encryptionKeyId: keyring.activeKeyId,
  };
}

export function decryptApiKey(encrypted: EncryptedApiKey) {
  const key = getEncryptionKeyring().keys.get(encrypted.encryptionKeyId);
  if (!key) throw new Error("找不到用于解密用户模型 API Key 的密钥。");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.apiKeyIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encrypted.apiKeyAuthTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.apiKeyCiphertext, "base64url")), decipher.final()]).toString("utf8");
}
