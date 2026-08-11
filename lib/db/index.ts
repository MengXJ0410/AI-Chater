import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import * as schema from "./schema";

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("数据库尚未配置：请在项目根目录创建 .env，填写 DATABASE_URL 后执行 npm run db:migrate。");
  }

  const client = createPool({ uri: connectionString, connectionLimit: 10 });
  return drizzle({ client, schema, mode: "default" });
}

const globalForDatabase = globalThis as typeof globalThis & {
  aiChaterDatabase?: ReturnType<typeof createDatabase>;
};

export function getDb() {
  globalForDatabase.aiChaterDatabase ??= createDatabase();
  return globalForDatabase.aiChaterDatabase;
}
