import { IStdPayload } from './StdPayload';

export interface IEventPayload extends IStdPayload
{
	eventId: string;
	title: string;
	startTime: string;
}

export class EventPayload implements IEventPayload
{
	eventId: string;
	title: string;
	startTime: string;

	// IStdPayload properties
	userId: string;
	username: string;
	profilePictureUrl: string | null;

	constructor(data: IEventPayload)
	{
		this.eventId = data.eventId;
		this.title = data.title;
		this.startTime = data.startTime;

		this.userId = data.userId;
		this.username = data.username;
		this.profilePictureUrl = data.profilePictureUrl;
	}
}