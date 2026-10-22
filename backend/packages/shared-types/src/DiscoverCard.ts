// One card in the browsing deck (subject IV.3), as returned by GET /profile/discover.
//
// Carries exactly the four criteria the subject requires the list to be sortable by — age,
// distance, fame and common tags — because the SORTING IS DONE BY THE FRONTEND on the full list
// it receives. The server only filters and ranks; the client arranges. Everything heavier (bio,
// all pictures, the tags themselves) comes from GET /profile/:userId when a card is opened.
export interface IDiscoverCard
{
	userId: string;
	username: string;
	firstName: string | null;
	age: number;
	// Whole kilometres, floored at 1, or null when the VIEWER has no location set. Derived from
	// a ~1 km-snapped position, so it cannot be used to trilaterate an address.
	distanceKm: number | null;
	fameRating: number;
	// How many interest tags this candidate shares with the viewer.
	commonTagCount: number;
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
	fameRating: number;
	commonTagCount: number;
	likesYou: boolean;
	profilePictureUrl: string;

	constructor(data: IDiscoverCard)
	{
		this.userId            = data.userId;
		this.username          = data.username;
		this.firstName         = data.firstName ?? null;
		this.age               = data.age;
		this.distanceKm        = data.distanceKm ?? null;
		this.fameRating        = data.fameRating;
		this.commonTagCount    = data.commonTagCount;
		this.likesYou          = data.likesYou;
		this.profilePictureUrl = data.profilePictureUrl;
	}

	static fromDbRow(row: any): DiscoverCard
	{
		return (new DiscoverCard({
			userId:            row.user_id,
			username:          row.username,
			firstName:         row.first_name ?? null,
			age:               Number(row.age),
			// Already an int or NULL from the query; Number(null) would be 0, hence the guard.
			distanceKm:        row.distance_km === null ? null : Number(row.distance_km),
			fameRating:        Number(row.fame_rating),
			commonTagCount:    Number(row.common_tag_count),
			likesYou:          row.likes_you === true,
			profilePictureUrl: row.profile_picture_url,
		}));
	}
}
