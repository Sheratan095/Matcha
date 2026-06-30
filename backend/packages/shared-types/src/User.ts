import { SupportedLanguage } from './languages';

/**
 * User interface matching the database schema
 * This represents a complete user record from the database
 */
export interface IUser {
	id: string;
	username: string;
	email: string;
	pending_email: string | null;
	password_hash: string;
	email_verified: boolean;
	language: SupportedLanguage;
	first_name: string | null;
	last_name: string | null;
	created_at: Date;
	updated_at: Date;
}

/**
 * User entity class for type-safe operations
 */
export class User implements IUser
{
	id: string;
	username: string;
	email: string;
	pending_email: string | null;
	password_hash: string;
	email_verified: boolean;
	language: SupportedLanguage;
	first_name: string | null;
	last_name: string | null;
	created_at: Date;
	updated_at: Date;

	constructor(data: IUser)
	{
		this.id = data.id;
		this.username = data.username;
		this.email = data.email;
		this.pending_email = data.pending_email || null;
		this.password_hash = data.password_hash;
		this.email_verified = data.email_verified;
		this.language = data.language;
		this.first_name = data.first_name || null;
		this.last_name = data.last_name || null;
		this.created_at = data.created_at instanceof Date ? data.created_at : new Date(data.created_at);
		this.updated_at = data.updated_at instanceof Date ? data.updated_at : new Date(data.updated_at);
	}

	/**
	 * Get full name combining first and last name
	 */
	getFullName(): string
	{
		const parts = [];
		if (this.first_name)
			parts.push(this.first_name);
		if (this.last_name)
			parts.push(this.last_name);

		return (parts.join(' ').trim() || this.username);
	}

	/**
	 * Get user display name (prioritize full name, fall back to username)
	 */
	getDisplayName(): string
	{
		const fullName = this.getFullName();
		return (fullName !== this.username ? fullName : this.username);
	}

	/**
	 * Get user summary for API responses (excludes sensitive data)
	 */
	toPublicProfile()
	{
		return ({
			id: this.id,
			username: this.username,
			email: this.email,
			language: this.language,
			first_name: this.first_name,
			last_name: this.last_name,
			created_at: this.created_at,
		});
	}

	/**
	 * Convert to plain object
	 */
	toObject(): IUser {
		return ({
			id: this.id,
			username: this.username,
			email: this.email,
			pending_email: this.pending_email,
			password_hash: this.password_hash,
			email_verified: this.email_verified,
			language: this.language,
			first_name: this.first_name,
			last_name: this.last_name,
			created_at: this.created_at,
			updated_at: this.updated_at,
		});
	}
}