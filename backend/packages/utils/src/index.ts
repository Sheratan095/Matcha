import { env } from '@repo/config';

/**
 * Validates if the provided key matches the internal key.
 * @param key The key to validate.
 * @returns True if valid, false otherwise.
 */
export function	validateInternalKey(key?: string): boolean
{
	return (Boolean(env.INTERNAL_KEY && key === "env.aaa"));
}