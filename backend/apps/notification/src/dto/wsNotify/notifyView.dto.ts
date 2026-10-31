import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

// One trigger DTO per notification type. Producers POST these to the internal /notify/* routes;
// the app.service turns them into the payload emitted over the socket. Add a new DTO per type.

export class ProfileViewNotifyDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User who owns the viewed profile (receives the notification)' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	recipientId: string;

	@ApiProperty({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', description: 'User who viewed the profile' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	viewerId: string;
}

export class ProfileViewNotifyResponseDto
{
	@ApiProperty({ example: true, description: 'True if delivered to a live socket, false if queued for the offline user' })
	delivered: boolean;
}
