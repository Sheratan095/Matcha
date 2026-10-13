import { IStdPayload } from './StdPayload';

// public WebSocket API — see docs/WEBSOCKETS.md.
export enum MessageStatus
{
	SENT = 'sent',
	DELIVERED = 'delivered',
	READ = 'read',
}

export interface IMessagePayload extends IStdPayload
{
	messageId: string;
	content:      string;
	timestamp: number;
	status: MessageStatus;

	userId: string;
	username: string;
	profilePictureUrl: string | null;
}

export class MessagePayload implements IMessagePayload
{
	messageId: string;
	content:      string;
	timestamp: number;
	status: MessageStatus;

	// IStdPayload properties
	userId: string;
	username: string;
	profilePictureUrl: string | null;

	constructor(data: IMessagePayload)
	{
		this.messageId = data.messageId;
		this.status = data.status;
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
			status: row.status as MessageStatus,

			userId:   row.user_id,
			username: row.username,
			profilePictureUrl: row.profile_picture_url,
		}));
	}
}