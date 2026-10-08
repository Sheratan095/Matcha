export interface ILike
{
	likerId: string;
	username: string;
	profilePictureUrl: string | null;
}

export class Like implements ILike
{
	likerId: string;
	username: string;
	profilePictureUrl: string | null;

	constructor(data: ILike)
	{
		this.likerId           = data.likerId;
		this.username          = data.username;
		this.profilePictureUrl = data.profilePictureUrl;
	}

	static fromDbRow(row: any): Like
	{
		return (new Like({
			likerId:           row.liker_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
		}));
	}
}

// Pushed on the 'match' event to BOTH users when a like completes a mutual like. Each recipient
// gets the OTHER user (otherId), so the same shape serves both sides of the match.
export interface IMatched
{
	otherId: string;
	username: string;
	profilePictureUrl: string | null;
}

export interface IUnLike
{
	unLikerId: string;
	username: string;
	profilePictureUrl: string | null;
}

export class Unike implements Unike
{
	unLikerId: string;
	username: string;
	profilePictureUrl: string | null;

	constructor(data: Unike)
	{
		this.unLikerId           = data.unLikerId;
		this.username          = data.username;
		this.profilePictureUrl = data.profilePictureUrl;
	}
}