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

	// A connection is the "other" user in a mutual like; the query aliases their id as
	// connection_id (see DbService.getConnections).
	static fromConnectionData(row: any): StdPayload
	{
		return (new StdPayload({
			userId:            row.connection_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
		}));
	}
}
