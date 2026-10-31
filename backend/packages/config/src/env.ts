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

	TZ: z.string().default("UTC"),

	FRONTEND_URL: z.string().default("http://localhost"),
	FRONTEND_PORT: z.coerce.number().default(4000),

	// No default and a minimum length, for INTERNAL_KEY and both JWT secrets: a fallback written
	// here is public, so a missing or placeholder value must stop the service instead of quietly
	// running on a secret anyone can read. `make generate_env` fills them with random values.
	INTERNAL_KEY: z.string().min(32),

	// HTTP Basic credentials guarding the Swagger docs at the gateway (/docs, /docs-json and the
	// per-service /<service>/docs*). Left unset the docs are NOT served at all (fail closed), so a
	// deployment never exposes the whole API surface by accident.
	DOCS_USER: z.string().optional(),
	DOCS_PASSWORD: z.string().optional(),

	GATEWAY_HOST: z.string().default("http://localhost"),
	GATEWAY_PORT: z.coerce.number().default(3000),

	// Rate limiting at the gateway (see docs/backend/rate-limiting.md). On unless explicitly "false":
	// in dev every tester shares 127.0.0.1, so it can be switched off locally.
	// Not z.coerce.boolean(): that runs Boolean("false"), which is true.
	RATE_LIMIT_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),

	AUTH_HOST: z.string().default("http://127.0.0.1"),
	AUTH_PORT: z.coerce.number().default(3001),

	NOTIFICATION_HOST: z.string().default("http://127.0.0.1"),
	NOTIFICATION_PORT: z.coerce.number().default(3002),
	// Max live notifications buffered per offline user; the oldest are dropped past this cap.
	NOTIFICATION_MAX_PENDING_PER_USER: z.coerce.number().default(50),

	PROFILE_HOST: z.string().default("http://127.0.0.1"),
	PROFILE_PORT: z.coerce.number().default(3003),

	// Database
	DATABASE_URL: z.string(), // connection string
	POSTGRES_HOST: z.string().default("127.0.0.1"),
	POSTGRES_USER: z.string(),
	POSTGRES_PASSWORD: z.string(),
	POSTGRES_DB: z.string(),
	POSTGRES_PORT: z.coerce.number().default(5432),

	// JWT
	JWT_ACCESS_SECRET: z.string().min(32),
	JWT_ACCESS_EXPIRATION_MS: z.coerce.number().default(900000), // 15 minutes in milliseconds
	JWT_REFRESH_SECRET: z.string().min(32),
	JWT_REFRESH_EXPIRATION_MS: z.coerce.number().default(604800000), // 7 days in milliseconds

	// EMAIL Verification
	EMAIL_VERIFICATION_TOKEN_LENGTH: z.coerce.number().default(8), // Length of the random token for email verification
	EMAIL_VERIFICATION_EXPIRATION_MS: z.coerce.number().default(900000), // Token lifetime, in milliseconds (also shown in the email)
	EMAIL_VERIFICATION_MAX_ATTEMPTS: z.coerce.number().default(5), // Max attempts for sending verification email

	// Forgot Password
	FORGOT_PASSWORD_TOKEN_LENGTH: z.coerce.number().default(12), // Length of the random token for forgot password
	FORGOT_PASSWORD_EXPIRATION_MS: z.coerce.number().default(900000), // Token lifetime, in milliseconds (also shown in the email)
	FORGOT_PASSWORD_MAX_ATTEMPTS: z.coerce.number().default(5), // Max attempts for sending forgot password email

	// SMTP Configuration
	SMTP_HOST: z.string().default("localhost"),
	SMTP_PORT: z.coerce.number().default(587),
	SMTP_USER: z.string(),
	SMTP_PASS: z.string(),

	// S3-compatible object storage (Garage), used by the profile service for pictures
	S3_ENDPOINT: z.string().default("http://127.0.0.1:3900"), // S3 API the backend talks to ("http://garage:3900" inside docker)
	S3_REGION: z.string().default("garage"), // Must match s3_region in infra/garage/garage.toml
	// Empty defaults keep services that don't use storage bootable; the profile service logs an error instead
	S3_ACCESS_KEY: z.string().default(""),
	S3_SECRET_KEY: z.string().default(""),
	S3_BUCKET: z.string().default("profile-pictures"),
	// Base URL the BROWSER uses to load images, already pointing at the bucket root
	S3_PUBLIC_URL: z.string().default("http://profile-pictures.web.garage.localhost:3902"),

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

// Full base URL the browser uses to reach the frontend, composed once so every
// service builds links the same way. The port is omitted for the standard
// HTTP/HTTPS ports so production URLs (e.g. https://matcha.com) don't carry a
// stray :443, while dev keeps its explicit :4000.
const buildFrontendBaseUrl = (): string =>
{
	const port = env.FRONTEND_PORT;

	if (!port || port === 80 || port === 443)
		return (env.FRONTEND_URL);

	return (`${env.FRONTEND_URL}:${port}`);
}

export const FRONTEND_BASE_URL = buildFrontendBaseUrl();

// Used for verifying the internal key in controllers and middleware without importing the entire env object
export const verifyInternalKey = (key?: string): boolean =>
{
	return (key === env.INTERNAL_KEY);
}
