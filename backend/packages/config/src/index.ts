import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.string().optional().default("3000"),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().optional().default("super-secret"),
});

export const getEnv = () => envSchema.parse(process.env);
