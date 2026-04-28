import { neon } from "@neondatabase/serverless";

type Sql = <T extends unknown[] = Record<string, unknown>[]>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T>;

let sql: Sql | null = null;

export function getSql() {
  if (sql) {
    return sql;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  sql = neon(databaseUrl) as unknown as Sql;
  return sql;
}
