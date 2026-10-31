import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class EventNotifyDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'Event UUID' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	eventId: string;

	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User who has been liked' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	inviterId: string;

	@ApiProperty({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', description: 'User who liked the profile' })
	@IsUUID()
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	inviteeId: string;

	// Only needed for event-cancel, where either side can act: the other one is notified.
	@ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', description: 'User who performed the action (inviter or invitee) | used only for event-cancel' })
	@IsOptional()
	@IsUUID()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	actorId?: string;

	@ApiProperty({ example: 'Meeting with team', description: 'Event title' })
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	title: string;

	@ApiProperty({ example: '2023-10-15T10:00:00.000Z', description: 'When the event starts' })
	@IsNotEmpty()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	startTime: string;
}

export class EventNotifyResponseDto
{
	@ApiProperty({ example: true, description: 'True if delivered to a live socket, false if queued for the offline user' })
	delivered: boolean;
}
