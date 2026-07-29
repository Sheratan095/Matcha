// packages/config/src/env.ts

import * as dotenv from "dotenv";
// zod is used for schema validation of environment variables
// zod.coerce is used to coerce string values from process.env into the correct types (e.g. numbers)
import { z } from "zod";
import findConfig from "find-config";

// load .env
dotenv.config({ path: findConfig(".env") || undefined });

// define schema
const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	SECURE: z.coerce.boolean().default(true), // Whether to enforce HTTPS and other security measures in production and when isn't specified

	TZ: z.string().default("UTC"),

	FRONTEND_URL: z.string().default("http://localhost"),
	FRONTEND_PORT: z.coerce.number().default(4000),

	INTERNAL_KEY: z.string().default("1234abc"),

	GATEWAY_HOST: z.string().default("http://localhost"),
	GATEWAY_PORT: z.coerce.number().default(3000),

	AUTH_HOST: z.string().default("http://localhost"),
	AUTH_PORT: z.coerce.number().default(3001),

	NOTIFICATION_HOST: z.string().default("http://localhost"),
	NOTIFICATION_PORT: z.coerce.number().default(3002),

	// Database
	DATABASE_URL: z.string(), // connection string
	POSTGRES_HOST: z.string().default("localhost"),
	POSTGRES_USER: z.string(),
	POSTGRES_PASSWORD: z.string(),
	POSTGRES_DB: z.string(),
	POSTGRES_PORT: z.coerce.number().default(5432),

	// JWT
	JWT_ACCESS_SECRET: z.string().default("fallback_jwt_secret"),
	JWT_ACCESS_EXPIRATION: z.string().default("15m"), // 15 minutes
	JWT_ACCESS_EXPIRATION_MS: z.coerce.number().default(900000), // 15 minutes in milliseconds
	JWT_REFRESH_SECRET: z.string().default("fallback_jwt_refresh_secret"),
	JWT_REFRESH_EXPIRATION: z.string().default("7d"), // 7 days
	JWT_REFRESH_EXPIRATION_MS: z.coerce.number().default(604800000), // 7 days in milliseconds

	// EMAIL Verification
	EMAIL_VERIFICATION_TOKEN_LENGTH: z.coerce.number().default(8), // Length of the random token for email verification
	EMAIL_VERIFICATION_EXPIRATION: z.string().default("1h"), // 1 hour
	EMAIL_VERIFICATION_EXPIRATION_MS: z.coerce.number().default(3600000), // 1 hour in milliseconds
	EMAIL_VERIFICATION_MAX_ATTEMPTS: z.coerce.number().default(5), // Max attempts for sending verification email

	// Forgot Password
	FORGOT_PASSWORD_TOKEN_LENGTH: z.coerce.number().default(12), // Length of the random token for forgot password
	FORGOT_PASSWORD_EXPIRATION: z.string().default("1h"), // 1 hour
	FORGOT_PASSWORD_EXPIRATION_MS: z.coerce.number().default(3600000), // 1 hour in milliseconds
	FORGOT_PASSWORD_MAX_ATTEMPTS: z.coerce.number().default(5), // Max attempts for sending forgot password email

	// SMTP Configuration
	SMTP_HOST: z.string().default("localhost"),
	SMTP_PORT: z.coerce.number().default(587),
	SMTP_USER: z.string(),
	SMTP_PASS: z.string(),

	// Github OAuth
	GITHUB_CLIENT_ID: z.string(),
	GITHUB_CLIENT_SECRET: z.string(),
	GITHUB_CALLBACK_URL: z.string(),
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
