import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { randomInt } from 'crypto';

let reservedUsernamesSet: Set<string> = new Set();

export async function loadReservedUsernames(relativeFilePath: string): Promise<void>
{
	try
	{
		const filePath = path.join(process.cwd(), relativeFilePath);
		if (fs.existsSync(filePath))
		{
			const content = fs.readFileSync(filePath, 'utf-8');
			const usernames = content.split(/\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
			reservedUsernamesSet = new Set(usernames);
		}
	}
	catch (error)
	{
		console.error('Failed to load reserved usernames', error);
	}
}

// Username is already normalized in the DTO, so we can directly check it against the set
export function validateUsername(username: string): void
{
	if (reservedUsernamesSet.size === 0)
		console.warn('Reserved usernames set is empty. Ensure loadReservedUsernames() was called successfully during app initialization.');

	if (reservedUsernamesSet.has(username))
		throw new BadRequestException('This username isn\'t available. Please choose a different username.', 'RESERVED_USERNAME');
}

export function	isReservedUsername(username: string): boolean
{
	return (reservedUsernamesSet.has(username));
}

const	USERNAME_MIN = 3;
const	USERNAME_MAX = 20; // Same bounds as RegisterDto and users_username_format_check

// Turns a provider handle into a username our own rule accepts. GitHub handles are up to 39
// characters of letters, digits and '-', ours are 3-20 of a-z, 0-9, '_' and '.'.
export function	usernameFromProvider(handle: string): string
{
	const	base = (handle ?? '')
		.toLowerCase()
		.replace(/-/g, '_')			// GitHub's separator becomes ours
		.replace(/[^a-z0-9_.]/g, '')	// Anything else is dropped
		.slice(0, USERNAME_MAX);

	if (base.length < USERNAME_MIN)
		return (`${base}_user`.slice(0, USERNAME_MAX));

	return (base);
}

// base + '_' + 4 random digits, with base cut so the whole stays within USERNAME_MAX. Random rather
// than the old timestamp digits, which two sign-ups in the same instant would share.
export function	usernameWithSuffix(base: string): string
{
	const	suffix = randomInt(1000, 10000).toString();

	return (`${base.slice(0, USERNAME_MAX - suffix.length - 1)}_${suffix}`);
}