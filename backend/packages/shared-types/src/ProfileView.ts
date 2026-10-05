export interface IProfileView
{
	viewerId: string;
	username: string;
	profilePictureUrl: string | null;
}

export class ProfileView implements IProfileView
{
	viewerId: string;
	username: string;
	profilePictureUrl: string | null;

	constructor(data: IProfileView)
	{
		this.viewerId          = data.viewerId;
		this.username          = data.username;
		this.profilePictureUrl = data.profilePictureUrl;
	}

	static fromDbRow(row: any): ProfileView
	{
		return (new ProfileView({
			viewerId:          row.viewer_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
		}));
	}
}
