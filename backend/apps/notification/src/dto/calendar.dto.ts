import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class EventInviteNotifyDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'Event UUID' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	eventId: string;

	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User who has been liked' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	inviterId: string;

	@ApiProperty({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', description: 'User who liked the profile' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	inviteeId: string;

	@ApiProperty({ example: 'Meeting with team', description: 'Event title' })
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	title: string;

	@ApiProperty({ example: '2023-10-15T10:00:00.000Z', description: 'When the event starts' })
	@IsNotEmpty()
	@Transform(({ value }) => value?.trim())
	startTime: string;
}

export class EventInviteNotifyResponseDto
{
	@ApiProperty({ example: true, description: 'True if delivered to a live socket, false if queued for the offline user' })
	delivered: boolean;
}
