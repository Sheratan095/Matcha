import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

const SALT_ROUNDS = 10;

/**
 * Hash a token using bcrypt
 * @param token - The plain text token to hash
 * @returns A promise that resolves to the hashed token
 */
export async function hashToken(token: string): Promise<string>
{
	return bcrypt.hash(token, SALT_ROUNDS);
}

/**
 * Compare a plain text token with its hash
 * @param plainToken - The plain text token to verify
 * @param hashedToken - The hashed token from the database
 * @returns A promise that resolves to true if the token matches, false otherwise
 */
export async function compareTokens(plainToken: string, hashedToken: string): Promise<boolean>
{
	return bcrypt.compare(plainToken, hashedToken);
}

/**
 * Hash a refresh token (JWT) with SHA-256
 * bcrypt only reads the first 72 bytes, and two JWTs of the same user only differ after that
 * (iat/exp), so an old refresh token would still match the new hash. The JWT is already
 * high-entropy, so a fast deterministic hash is enough and allows a direct lookup by hash.
 * @param token - The plain refresh token
 * @returns The hex-encoded SHA-256 digest
 */
export function hashRefreshToken(token: string): string
{
	return (createHash('sha256').update(token).digest('hex'));
}
