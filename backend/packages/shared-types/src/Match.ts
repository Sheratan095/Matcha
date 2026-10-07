export interface IMatch
{
	otherId: string;
	username: string;
	profilePictureUrl: string | null;
}

export class IMatch implements IMatch
{
	otherId: string;
	username: string;
	profilePictureUrl: string | null;

	constructor(data: IMatch)
	{
		this.otherId         = data.otherId;
		this.username          = data.username;
		this.profilePictureUrl = data.profilePictureUrl;
	}
}