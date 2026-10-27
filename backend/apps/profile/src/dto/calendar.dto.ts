import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, IsOptional } from 'class-validator';

export class CalendarEventDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'Event UUID' })
	@IsUUID()
	eventId: string;

	@ApiProperty({ example: 'user123', description: 'Id of the event creator' })
	@IsString()
	inviterId: string;

	@ApiProperty({ example: 'user456', description: 'Id of the event invitee' })
	@IsString()
	inviteeId: string;

	@ApiProperty({ example: 'Meeting with team', description: 'Event title' })
	@IsString()
	title: string;

	@ApiProperty({ example: 'Discuss project updates', description: 'Event description' })
	@IsString()
	description: string;

	@ApiProperty({ example: '2024-06-01T10:00:00Z', description: 'Event start time in ISO 8601 format' })
	@IsString()
	startTime: string;

	@ApiProperty({ example: '2024-06-01T11:00:00Z', description: 'Event end time in ISO 8601 format' })
	@IsString()
	endTime: string;

	@ApiProperty({ example: 'confirmed', description: 'Event status', enum: ['confirmed', 'pending', 'declined', 'cancelled'] })
	@IsString()
	status: string;

	@ApiProperty({ example: 41.905333, nullable: true, description: 'Latitude in decimal degrees, at full precision; null if no location set' })
	latitude: number | null;

	@ApiProperty({ example: 12.542861, nullable: true, description: 'Longitude in decimal degrees, at full precision; null if no location set' })
	longitude: number | null;
}

export class GetCalendarResponseDto
{
	@ApiProperty({ type: [CalendarEventDto], description: 'List of calendar events' })
	events: CalendarEventDto[];
}