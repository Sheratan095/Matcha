// packages/config/src/env.ts

import * as dotenv from "dotenv";
import { z } from "zod";
import findConfig from "find-config";

// load .env
dotenv.config({ path: findConfig(".env") || undefined });

// define schema
const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	INTERNAL_KEY: z.string().default("1234abc"),

	GATEWAY_HOST: z.string().default("http://localhost"),
	GATEWAY_PORT: z.coerce.number().default(3000),

	AUTH_HOST: z.string().default("http://localhost"),
	AUTH_PORT: z.coerce.number().default(3001),

	// Database
	DATABASE_URL: z.string(), // connection string
	POSTGRES_HOST: z.string().default("localhost"),
	POSTGRES_USER: z.string(),
	POSTGRES_PASSWORD: z.string(),
	POSTGRES_DB: z.string(),
	POSTGRES_PORT: z.coerce.number().default(5432),
});

// validate
const parsed = envSchema.safeParse(process.env);

if (!parsed.success)
{
	console.error("❌ Invalid environment variables:");
	console.error(parsed.error.format());
	process.exit(1);
}

export const env = parsed.data;

// Used for verifying the internal key in controllers and middleware without importing the entire env object
export const verifyInternalKey = (key?: string): boolean =>
{
	return (key === env.INTERNAL_KEY);
}
