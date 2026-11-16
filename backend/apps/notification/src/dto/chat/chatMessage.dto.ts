import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, Length, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { multiline } from '@repo/utils';

// One trigger DTO per notification type. Producers POST these to the internal /notify/* routes;
// the app.service turns them into the payload emitted over the socket. Add a new DTO per type.

export class ChatMessageDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User who will receive the message' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	toUserId: string;

	// Sanitised BEFORE the length check, so a message of nothing but spaces, newlines or invisible
	// characters (zero-width spaces make an "empty-looking" message) is rejected as empty rather than stored.
	// Stored as typed otherwise: the chat UI escapes on render, so "<3" and "a < b" stay as written.
	@ApiProperty({ example: 'Hello, how are you?', description: 'The content of the message' })
	@Transform(({ value }) => multiline(value))
	@IsString()
	@IsNotEmpty()
	@Length(1, 1000, { message: 'Message content must be between 1 and 1000 characters' })
	content: string;
}

export class ChatMessageResponseDto
{
	@ApiProperty({ example: true, description: 'True if delivered to a live socket, false if the recipient was offline' })
	delivered: boolean;
}