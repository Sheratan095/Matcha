import * as bcrypt from 'bcrypt';

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