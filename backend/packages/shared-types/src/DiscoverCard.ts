// The orderings the browsing deck accepts: the four single criteria the subject names, plus the
// weighted default. Real enums rather than string unions so class-validator's @IsEnum can list
// the accepted values back to the client in its error message (same reason as SupportedLanguages).
export enum DiscoverSorts
{
	BEST     = 'best',
	DISTANCE = 'distance',
	AGE      = 'age',
	FAME     = 'fame',
	TAGS     = 'tags',
}

export enum DiscoverOrders
{
	ASC  = 'asc',
	DESC = 'desc',
}

export type DiscoverSort  = `${DiscoverSorts}`;
export type DiscoverOrder = `${DiscoverOrders}`;

// One card in the browsing deck (subject IV.3), as returned by GET /profile/discover.
// Deliberately thin: a card is a photo with a name, an age and a distance over it. Everything
// else (bio, every picture, interests) comes from GET /profile/:userId when the card is opened.
export interface IDiscoverCard
{
	userId: string;
	username: string;
	firstName: string | null;
	age: number;
	// Whole kilometres, floored at 1, or null when the VIEWER has no location set. Derived from
	// a ~1 km-snapped position, so it cannot be used to trilaterate an address.
	distanceKm: number | null;
	// True when this candidate has already liked the viewer: liking back matches immediately.
	likesYou: boolean;
	profilePictureUrl: string;
}

export class DiscoverCard implements IDiscoverCard
{
	userId: string;
	username: string;
	firstName: string | null;
	age: number;
	distanceKm: number | null;
	likesYou: boolean;
	profilePictureUrl: string;

	constructor(data: IDiscoverCard)
	{
		this.userId            = data.userId;
		this.username          = data.username;
		this.firstName         = data.firstName ?? null;
		this.age               = data.age;
		this.distanceKm        = data.distanceKm ?? null;
		this.likesYou          = data.likesYou;
		this.profilePictureUrl = data.profilePictureUrl;
	}

	// The fame rating and the common-tag count are selected by the discovery query to filter and
	// sort on, but are NOT part of a card: they never reach the client.
	static fromDbRow(row: any): DiscoverCard
	{
		return (new DiscoverCard({
			userId:            row.user_id,
			username:          row.username,
			firstName:         row.first_name ?? null,
			age:               Number(row.age),
			// Already an int or NULL from the query; Number(null) would be 0, hence the guard.
			distanceKm:        row.distance_km === null ? null : Number(row.distance_km),
			likesYou:          row.likes_you === true,
			profilePictureUrl: row.profile_picture_url,
		}));
	}
}
