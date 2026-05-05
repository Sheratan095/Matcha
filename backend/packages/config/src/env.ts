// packages/config/src/env.ts

import * as dotenv from "dotenv";
import { z } from "zod";
import findConfig from "find-config";

// load .env
dotenv.config({ path: findConfig(".env") || undefined });

// define schema
const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	GATEWAY_HOST: z.string().default("http://localhost"),
	GATEWAY_PORT: z.coerce.number().default(3000),

	AUTH_HOST: z.string().default("http://localhost"),
	AUTH_PORT: z.coerce.number().default(3001),
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