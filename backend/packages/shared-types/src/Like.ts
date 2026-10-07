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
