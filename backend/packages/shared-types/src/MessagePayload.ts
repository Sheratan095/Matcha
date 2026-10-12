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

	// For conversation history: the SELECT joins users / user_pictures and aliases the sender id
	// and picture to user_id / profile_picture_url, and selects the real created_at column (not
	// aliased), which is converted here to the epoch-ms number the payload exposes.
	static fromDbRow(row: any): MessagePayload
	{
		return (new MessagePayload({
			messageId: row.message_id,
			content:      row.content,
			timestamp: new Date(row.created_at).getTime(),

			userId:   row.user_id,
			username: row.username,
			profilePictureUrl: row.profile_picture_url,
		}));
	}
}