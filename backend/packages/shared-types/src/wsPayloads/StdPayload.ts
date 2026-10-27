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

	// getVisitedProfiles selects pv.viewed_id, u.username, up.url AS profile_picture_url.
	static fromVisitData(row: any): StdPayload
	{
		return (new StdPayload({
			userId:            row.viewed_id,
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

export interface IStdPayloadGeo extends IStdPayload
{
	latitude: number | null;
	longitude: number | null;
}

/**
 * @brief Quantize a coordinate to a ~1 km grid, mirroring snap_coord() in 002_create_profiles.sql.
 *
 * An exact coordinate is a home address, so no published position may carry full precision.
 * The queries already snap, but this runs again on the way out because THIS is the last gate
 * before a coordinate reaches a WebSocket payload or an HTTP response — a future query that
 * forgets to snap is then still safe. Snapping is idempotent (Math.round, not Math.floor), so
 * doing it twice costs nothing.
 */
export function	snapCoord(coord: number | null | undefined): number | null
{
	if (coord === null || coord === undefined)
		return (null);

	return (Math.round(coord * 100) / 100);
}

// StdPayload plus the user's coordinates — for the matches map, where each match needs a location.
export class StdPayloadGeo extends StdPayload implements IStdPayloadGeo
{
	latitude: number | null;
	longitude: number | null;

	// Snapped in the CONSTRUCTOR, not in the mapper below, so no way of building a
	// StdPayloadGeo can carry an exact position.
	constructor(data: IStdPayloadGeo)
	{
		super(data); // super means StdPayload constructor, which sets userId, username, and profilePictureUrl.
		this.latitude  = snapCoord(data.latitude);
		this.longitude = snapCoord(data.longitude);
	}

	// getMatchesMap selects other.id AS user_id, other.username, up.url AS profile_picture_url,
	// and the already-snapped p.latitude, p.longitude.
	static fromMatchMapData(row: any): StdPayloadGeo
	{
		return (new StdPayloadGeo({
			userId:            row.user_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
			latitude:          row.latitude ?? null,
			longitude:         row.longitude ?? null,
		}));
	}
}
