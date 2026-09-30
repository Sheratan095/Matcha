export interface IProfileView
{
	viewerId: string;
	viewedId: string;
}

export class ProfileView implements IProfileView
{
	viewerId: string;
	viewedId: string;

	constructor(data: IProfileView)
	{
		this.viewerId = data.viewerId;
		this.viewedId = data.viewedId;
	}

	static fromDbRow(row: any): ProfileView
	{
		return (new ProfileView({
			viewerId: row.viewer_id,
			viewedId: row.viewed_id,
		}));
	}
}
