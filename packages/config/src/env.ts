import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("ClickShop Intelligence"),
  APP_BASE_URL: z.string().url().default("http://localhost:4242"),

  LIBRECHAT_BASE_URL: z.string().url().default("http://localhost:4243"),
  LIBRECHAT_EMBED_MODE: z.enum(["iframe", "proxy"]).default("iframe"),

  CLICKHOUSE_HOST: z.string().min(1),
  CLICKHOUSE_PORT: z.coerce.number().default(8443),
  CLICKHOUSE_USER: z.string().default("default"),
  CLICKHOUSE_PASSWORD: z.string().min(1),
  CLICKHOUSE_SECURE: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  CLICKHOUSE_DATABASE: z.string().default("default"),

  POSTGRES_URL: z.string().min(1),
  POSTGRES_HOST: z.string().optional(),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default("postgres"),
  POSTGRES_USER: z.string().default("postgres"),
  POSTGRES_PASSWORD: z.string().optional(),

  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),

  CLICKHOUSE_MCP_URL: z.string().url().optional(),
  CLICKHOUSE_MCP_AUTH_TYPE: z.string().default("bearer"),
  CLICKHOUSE_MCP_TOKEN: z.string().optional(),

  POSTGRES_MCP_URL: z.string().url().optional(),
  POSTGRES_MCP_AUTH_TYPE: z.string().default("bearer"),
  POSTGRES_MCP_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Environment validation failed:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Invalid environment configuration — see errors above.");
  }
  _env = result.data;
  return _env;
}

export function getEnvSafe(): { env: Env | null; errors: string[] } {
  const result = envSchema.safeParse(process.env);
  if (result.success) return { env: result.data, errors: [] };
  return {
    env: null,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

export { envSchema };
