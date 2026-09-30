import { SupportedLanguage } from './languages';

/**
 * User gender
 */
export type Gender = 'male' | 'female' | 'other';

/**
 * Who the user is interested in
 */
export type SexualPreference = 'male' | 'female' | 'both' | 'other';

/**
 * A reusable interest tag (e.g. #vegan, #geek, #piercing).
 * Tags are stored once and referenced by many users so they can be reused.
 */
export interface IInterestTag {
	id: string;
	name: string; // stored without the leading '#', e.g. "vegan"
}

/**
 * A single profile picture. A user can have up to 5, one of which is the
 * designated profile picture.
 */
export interface IUserPicture {
	id: string;
	url: string;
	isProfile: boolean;
	position: number; // 0..4, ordering within the user's gallery
}

/**
 * Maximum number of pictures a user can upload
 */
export const MAX_USER_PICTURES = 5;

/**
 * A user's profile as owned by the profile service.
 * Contains only the fields the profile service stores — no auth fields.
 */
export interface IProfile
{
	userId: string;
	firstName: string | null;
	lastName: string | null;
	gender: Gender | null;
	sexualPreference: SexualPreference | null;
	biography: string | null;
	interests: IInterestTag[];
	pictures: IUserPicture[];
	createdAt: Date;
	updatedAt: Date;
}

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
	gender: Gender | null;
	sexual_preference: SexualPreference | null;
	biography: string | null;
	interests: IInterestTag[];
	pictures: IUserPicture[];
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
	gender: Gender | null;
	sexual_preference: SexualPreference | null;
	biography: string | null;
	interests: IInterestTag[];
	pictures: IUserPicture[];
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
		this.gender = data.gender || null;
		this.sexual_preference = data.sexual_preference || null;
		this.biography = data.biography || null;
		this.interests = data.interests || [];
		this.pictures = data.pictures || [];
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
	 * Get the designated profile picture, or null if none is set
	 */
	getProfilePicture(): IUserPicture | null
	{
		const profile = this.pictures.find((picture) => picture.isProfile);

		return (profile || null);
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
			gender: this.gender,
			sexual_preference: this.sexual_preference,
			biography: this.biography,
			interests: this.interests,
			pictures: this.pictures,
			created_at: this.created_at,
		});
	}

	iscompleteProfile(): boolean
	{
		return (
			this.first_name !== null &&
			this.last_name !== null &&
			this.gender !== null &&
			this.sexual_preference !== null &&
			this.biography !== null &&
			this.interests.length > 0 &&
			this.pictures.length > 0
		);
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
			gender: this.gender,
			sexual_preference: this.sexual_preference,
			biography: this.biography,
			interests: this.interests,
			pictures: this.pictures,
			created_at: this.created_at,
			updated_at: this.updated_at,
		});
	}
}
