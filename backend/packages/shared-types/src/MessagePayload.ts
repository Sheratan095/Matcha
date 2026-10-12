import { IStdPayload } from './StdPayload';

export interface IMessagePayload extends IStdPayload
{
	messageId: string;
	content:      string;
	timestamp: number;
	userId: string;
	username: string;
	profilePictureUrl: string | null;
}

export class MessagePayload implements IMessagePayload
{
	messageId: string;
	content:      string;
	timestamp: number;

	// IStdPayload properties
	userId: string;
	username: string;
	profilePictureUrl: string | null;

	constructor(data: IMessagePayload)
	{
		this.messageId = data.messageId;
		this.content      = data.content;
		this.timestamp = data.timestamp;

		this.userId = data.userId;
		this.username = data.username;
		this.profilePictureUrl = data.profilePictureUrl;
	}

	static fromDbRow(row: any): MessagePayload
	{
		return (new MessagePayload({
			messageId: row.message_id,
			content:      row.content,
			timestamp: row.timestamp,

			userId:   row.user_id,
			username: row.username,
			profilePictureUrl: row.profile_picture_url,
		}));
	}
}