export interface IStdPayload
{
	userId: string;
	username: string;
	profilePictureUrl: string | null;
}

export class StdPayload implements IStdPayload
{
	userId: string;
	username: string;
	profilePictureUrl: string | null;

	constructor(data: StdPayload)
	{
		this.userId          = data.userId;
		this.username          = data.username;
		this.profilePictureUrl = data.profilePictureUrl;
	}

	static fromViewData(row: any): StdPayload
	{
		return (new StdPayload({
			userId: row.userId,
			username: row.username,
			profilePictureUrl: row.profilePictureUrl,
		}));
	}

	static fromLikeData(row: any): StdPayload
	{
		return (new StdPayload({
			userId: row.userId,
			username: row.username,
			profilePictureUrl: row.profilePictureUrl,
		}));
	}
}
