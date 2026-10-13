import { ApiProperty } from '@nestjs/swagger';

// One message in a conversation — the same shape the socket delivers on send (MessagePayload).
export class ChatMessageItemDto
{
	@ApiProperty({ example: 'a1b2c3d4-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'Message id' })
	messageId: string;

	@ApiProperty({ example: 'Hello, how are you?', description: 'Message content' })
	content: string;

	@ApiProperty({ example: 1760880333797, description: 'Sent time, epoch milliseconds' })
	timestamp: number;

	@ApiProperty({ example: 'a1b2c3d4-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'Sender user id' })
	userId: string;

	@ApiProperty({ example: 'alice', description: 'Sender username' })
	username: string;

	@ApiProperty({ example: 'sent', description: 'Message status: sent, delivered, or read' })
	status: string;

	@ApiProperty({ example: 'https://.../pic.webp', description: "Sender's profile picture URL, or null if none", nullable: true })
	profilePictureUrl: string | null;
}

export class ChatHistoryResponseDto
{
	@ApiProperty({ type: [ChatMessageItemDto], description: 'Messages exchanged with the user, oldest first' })
	messages: ChatMessageItemDto[];
}

// One conversation in the "my chats" list: the other participant + a preview of the last message.
export class ChatListItemDto
{
	@ApiProperty({ example: 'c0ffee00-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'The conversation id (pass to GET /chat/:chatId)' })
	chatId: string;

	@ApiProperty({ example: 'a1b2c3d4-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'The other participant' })
	userId: string;

	@ApiProperty({ example: 'alice', description: "The other participant's username" })
	username: string;

	@ApiProperty({ example: 'https://.../pic.webp', description: "The other participant's profile picture URL, or null if none", nullable: true })
	profilePictureUrl: string | null;

	@ApiProperty({ example: 'See you tomorrow!', description: 'Content of the most recent message' })
	lastMessage: string;

	@ApiProperty({ example: 1760880333797, description: 'Time of the most recent message, epoch milliseconds' })
	timestamp: number;

	@ApiProperty({ example: 'a1b2c3d4-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'Who sent the most recent message' })
	lastSenderId: string;
}

export class ChatListResponseDto
{
	@ApiProperty({ type: [ChatListItemDto], description: 'Conversations, newest activity first' })
	chats: ChatListItemDto[];
}
