import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

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

export function generateFallbackUsername(base: string): string
{
	// Simple fallback to handle collisions: base + timestamp suffix
	const suffix = Date.now().toString().slice(-4);

	return (`${base}_${suffix}`);
}