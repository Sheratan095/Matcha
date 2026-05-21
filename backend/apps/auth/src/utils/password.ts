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
	return (await bcrypt.compare(password, hash));
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

export function validatePassword(password: string): void
{
	if (commonPasswordsSet.has(password))
	{
		throw new BadRequestException('This password is too common. Please choose a more secure password.', 'COMMON_PASSWORD');
	}
}