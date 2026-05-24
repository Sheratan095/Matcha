import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

let commonPasswordsSet: Set<string> = new Set();

// Helper methods used just by this class
export async function hashPassword(password: string): Promise<string>
{
	const saltRounds = 10;
	return (await bcrypt.hash(password, saltRounds));
}

export async function comparePasswords(password: string, hash: string): Promise<boolean>
{
	try
	{
		return (await bcrypt.compare(password, hash));
	}
	catch (error)
	{
		// If the hash is invalid (e.g. from seeds), it's definitely not a match
		return (false);
	}
}

export async function loadCommonPasswords(relativeFilePath: string): Promise<void>
{
	try
	{
		const filePath = path.join(process.cwd(), relativeFilePath);
		if (fs.existsSync(filePath))
		{
			const content = fs.readFileSync(filePath, 'utf-8');
			const passwords = content.split(/\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
			commonPasswordsSet = new Set(passwords);
		}
	}
	catch (error)
	{
		console.error('Failed to load common passwords', error);
	}
}

export async function validatePassword(password: string, previousPasswordHash: string = null): Promise<void>
{
	if (commonPasswordsSet.has(password))
	{
		throw new BadRequestException('This password is too common. Please choose a more secure password.', 'COMMON_PASSWORD');
	}

	if (previousPasswordHash && await comparePasswords(password, previousPasswordHash))
	{
		throw new BadRequestException('The new password must be different from the previous one.', 'PASSWORD_REUSE');
	}
}