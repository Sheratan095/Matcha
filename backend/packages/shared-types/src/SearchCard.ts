// One advanced-search result (subject IV.4), as returned by GET /profile/search.
//
// A lighter sibling of DiscoverCard: the same sortable criteria — age, distance, fame and common
// tags, which the FRONTEND sorts by — but no like relation. A search result is something to open,
// and the full profile (GET /profile/:userId) carries liked / likesYou / matched.
export interface ISearchCard
{
	userId: string;
	username: string;
	firstName: string | null;
	age: number;
	// Whole kilometres, floored at 1, or null when the VIEWER has no location set. Derived from
	// a ~1 km-snapped position, so it cannot be used to trilaterate an address.
	distanceKm: number | null;
	fameRating: number;
	// How many interest tags this result shares with the viewer.
	commonTagCount: number;
	profilePictureUrl: string;
}

export class SearchCard implements ISearchCard
{
	userId: string;
	username: string;
	firstName: string | null;
	age: number;
	distanceKm: number | null;
	fameRating: number;
	commonTagCount: number;
	profilePictureUrl: string;

	constructor(data: ISearchCard)
	{
		this.userId            = data.userId;
		this.username          = data.username;
		this.firstName         = data.firstName ?? null;
		this.age               = data.age;
		this.distanceKm        = data.distanceKm ?? null;
		this.fameRating        = data.fameRating;
		this.commonTagCount    = data.commonTagCount;
		this.profilePictureUrl = data.profilePictureUrl;
	}

	static fromDbRow(row: any): SearchCard
	{
		return (new SearchCard({
			userId:            row.user_id,
			username:          row.username,
			firstName:         row.first_name ?? null,
			age:               Number(row.age),
			// Already an int or NULL from the query; Number(null) would be 0, hence the guard.
			distanceKm:        row.distance_km === null ? null : Number(row.distance_km),
			fameRating:        Number(row.fame_rating),
			commonTagCount:    Number(row.common_tag_count),
			profilePictureUrl: row.profile_picture_url,
		}));
	}
}
