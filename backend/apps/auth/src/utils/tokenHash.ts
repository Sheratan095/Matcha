import * as bcrypt from 'bcrypt';

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
