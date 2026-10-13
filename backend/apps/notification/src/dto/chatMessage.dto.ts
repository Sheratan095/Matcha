import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, Length, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ChatMessageItemDto } from './chat.dto';

// One trigger DTO per notification type. Producers POST these to the internal /notify/* routes;
// the app.service turns them into the payload emitted over the socket. Add a new DTO per type.

export class ChatMessageDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User who will receive the message' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	toUserId: string;

	//TODO regex to avoid js injection, html tags, etc.
	@ApiProperty({ example: 'Hello, how are you?', description: 'The content of the message' })
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

// TODO unify ErrorDto making it global??
export class ErrorDto
{
	@ApiProperty({ example: 'error', description: 'Error message' })
	message: string;
}
