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

	// all profile_pics are ?? null, so we can safely use the nullish coalescing operator here.
	//	=> so the frontend never receives UNDEFINED for profilePictureUrl

	// getProfileViewers selects pv.viewer_id, u.username, up.url AS profile_picture_url.
	static fromViewData(row: any): StdPayload
	{
		return (new StdPayload({
			userId:            row.viewer_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
		}));
	}

	// getLikers selects l.liker_id, u.username, up.url AS profile_picture_url.
	static fromLikeData(row: any): StdPayload
	{
		return (new StdPayload({
			userId:            row.liker_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
		}));
	}

	// A connection is the "other" user in a mutual like; the query aliases their id as
	// connection_id (see DbService.getConnections).
	static fromMatchData(row: any): StdPayload
	{
		return (new StdPayload({
			userId:            row.connection_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
		}));
	}

	// getBlockedUsers selects b.blocked_id, u.username, up.url AS profile_picture_url.
	static fromBlockData(row: any): StdPayload
	{
		return (new StdPayload({
			userId:            row.blocked_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
		}));
	}
}
