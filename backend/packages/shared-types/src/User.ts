import { SupportedLanguage } from './languages';

export type Gender = 'male' | 'female' | 'other';

export type SexualPreference = 'male' | 'female' | 'both' | 'other';

export interface IInterestTag {
	id: string;
	name: string; // stored without the leading '#', e.g. "vegan"
}

export class InterestTag implements IInterestTag
{
	id: string;
	name: string;

	constructor(data: IInterestTag)
	{
		this.id   = data.id;
		this.name = data.name;
	}

	static fromDbRow(row: any): InterestTag
	{
		return (new InterestTag({ id: row.id, name: row.name }));
	}
}

export interface IUserPicture {
	id: string;
	url: string;
	isProfile: boolean;
	position: number; // 0..4, ordering within the user's gallery
}

export class UserPicture implements IUserPicture
{
	id: string;
	url: string;
	isProfile: boolean;
	position: number;

	constructor(data: IUserPicture)
	{
		this.id        = data.id;
		this.url       = data.url;
		this.isProfile = data.isProfile;
		this.position  = data.position;
	}

	static fromDbRow(row: any): UserPicture
	{
		return (new UserPicture({
			id:        row.id,
			url:       row.url,
			isProfile: row.is_profile,
			position:  row.position,
		}));
	}
}

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

export class Profile implements IProfile
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

	constructor(data: IProfile)
	{
		this.userId           = data.userId;
		this.firstName        = data.firstName || null;
		this.lastName         = data.lastName || null;
		this.gender           = data.gender || null;
		this.sexualPreference = data.sexualPreference || null;
		this.biography        = data.biography || null;
		this.interests        = data.interests || [];
		this.pictures         = data.pictures || [];
		this.createdAt        = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
		this.updatedAt        = data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt);
	}

	static fromDbRow(row: any, interests: IInterestTag[] = [], pictures: IUserPicture[]= []): Profile
	{
		return (new Profile({
			userId:           row.user_id,
			firstName:        row.first_name || null,
			lastName:         row.last_name || null,
			gender:           row.gender || null,
			sexualPreference: row.sexual_preference || null,
			biography:        row.biography || null,
			interests,
			pictures,
			createdAt:        row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
			updatedAt:        row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
		}));
	}
}

export interface IUser
{
	id: string;
	username: string;
	email: string;
	pendingEmail: string | null;
	passwordHash: string;
	emailVerified: boolean;
	language: SupportedLanguage;
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

export class User implements IUser
{
	id: string;
	username: string;
	email: string;
	pendingEmail: string | null;
	passwordHash: string;
	emailVerified: boolean;
	language: SupportedLanguage;
	firstName: string | null;
	lastName: string | null;
	gender: Gender | null;
	sexualPreference: SexualPreference | null;
	biography: string | null;
	interests: IInterestTag[];
	pictures: IUserPicture[];
	createdAt: Date;
	updatedAt: Date;

	constructor(data: IUser)
	{
		this.id              = data.id;
		this.username        = data.username;
		this.email           = data.email;
		this.pendingEmail    = data.pendingEmail || null;
		this.passwordHash    = data.passwordHash;
		this.emailVerified   = data.emailVerified;
		this.language        = data.language;
		this.firstName       = data.firstName || null;
		this.lastName        = data.lastName || null;
		this.gender          = data.gender || null;
		this.sexualPreference = data.sexualPreference || null;
		this.biography       = data.biography || null;
		this.interests       = data.interests || [];
		this.pictures        = data.pictures || [];
		this.createdAt       = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
		this.updatedAt       = data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt);
	}

	static fromDbRow(row: any): User
	{
		return (new User({
			id:               row.id,
			username:         row.username,
			email:            row.email,
			pendingEmail:     row.pending_email || null,
			passwordHash:     row.password_hash,
			emailVerified:    row.email_verified,
			language:         row.language,
			firstName:        row.first_name || null,
			lastName:         row.last_name || null,
			gender:           row.gender || null,
			sexualPreference: row.sexual_preference || null,
			biography:        row.biography || null,
			interests:        [],
			pictures:         [],
			createdAt:        row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
			updatedAt:        row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
		}));
	}

	getFullName(): string
	{
		const parts = [];

		if (this.firstName)
			parts.push(this.firstName);
		if (this.lastName)
			parts.push(this.lastName);

		return (parts.join(' ').trim() || this.username);
	}

	getDisplayName(): string
	{
		const fullName = this.getFullName();

		return (fullName !== this.username ? fullName : this.username);
	}

	getProfilePicture(): IUserPicture | null
	{
		const profile = this.pictures.find((picture) => picture.isProfile);

		return (profile || null);
	}

	toPublicProfile()
	{
		return ({
			id:               this.id,
			username:         this.username,
			email:            this.email,
			language:         this.language,
			firstName:        this.firstName,
			lastName:         this.lastName,
			gender:           this.gender,
			sexualPreference: this.sexualPreference,
			biography:        this.biography,
			interests:        this.interests,
			pictures:         this.pictures,
			createdAt:        this.createdAt,
		});
	}

	isCompleteProfile(): boolean
	{
		return (
			this.firstName !== null &&
			this.lastName !== null &&
			this.gender !== null &&
			this.sexualPreference !== null &&
			this.biography !== null &&
			this.interests.length > 0 &&
			this.pictures.length > 0
		);
	}

	toObject(): IUser
	{
		return ({
			id:               this.id,
			username:         this.username,
			email:            this.email,
			pendingEmail:     this.pendingEmail,
			passwordHash:     this.passwordHash,
			emailVerified:    this.emailVerified,
			language:         this.language,
			firstName:        this.firstName,
			lastName:         this.lastName,
			gender:           this.gender,
			sexualPreference: this.sexualPreference,
			biography:        this.biography,
			interests:        this.interests,
			pictures:         this.pictures,
			createdAt:        this.createdAt,
			updatedAt:        this.updatedAt,
		});
	}
}
