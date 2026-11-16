import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, IsOptional, IsNotEmpty, IsISO8601, Matches, IsNumber, Min, Max } from 'class-validator';
import { multiline, singleLine } from '@repo/utils';

// Date + time + a mandatory offset ('Z' or '±hh:mm'); @IsISO8601 alone also accepts offset-less times.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

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

	@ApiProperty({ example: 'accepted', description: 'Event status', enum: ['accepted', 'pending', 'declined', 'cancelled'] })
	@IsString()
	status: string;

	@ApiProperty({ example: 41.905333, nullable: true, description: 'Latitude in decimal degrees, at full precision; null if no location set' })
	latitude: number | null;

	@ApiProperty({ example: 12.542861, nullable: true, description: 'Longitude in decimal degrees, at full precision; null if no location set' })
	longitude: number | null;
}

export class GetCalendarResponseDto
{
	@ApiProperty({ type: [CalendarEventDto], description: 'List of calendar events, excluded cancelled ALWAYS and declined events only where the user is the invitee' })
	events: CalendarEventDto[];
}

export class PostCalendarEventDto
{
	// A user id is always a UUID: checking it here answers a malformed one with a clean 400
	// instead of letting Postgres reject the cast (22P02) deeper in.
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'Id of the invited user' })
	@IsUUID()
	inviteeId: string;

	// One clean line, shown to the invitee and pushed in their notification. singleLine returns a
	// non-string untouched: it must fail @IsString with a 400, not crash .trim() with a 500.
	@ApiProperty({ example: 'Meeting with team', description: 'Event title' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@Transform(({ value }) => singleLine(value))
	title: string;

	// May span lines; control / invisible characters removed, trimmed. Stored as typed, escaped on render.
	@ApiPropertyOptional({ example: 'Discuss project updates', description: 'Event description' })
	@IsOptional()
	@Transform(({ value }) => multiline(value))
	@IsString()
	@MaxLength(500)
	description?: string;

	// The offset is mandatory: without it Postgres reads the time in the DB's timezone (UTC),
	// so '2026-11-01T20:00' sent from Rome would land an hour off.
	@ApiProperty({ example: '2026-11-01T20:00:00+01:00', description: 'Event start time, ISO 8601 with a timezone offset (Z or ±hh:mm)' })
	@IsISO8601({ strict: true })
	@Matches(ISO_WITH_OFFSET, { message: 'startTime must include a timezone offset (Z or ±hh:mm)' })
	startTime: string;

	@ApiProperty({ example: '2026-11-01T22:00:00+01:00', description: 'Event end time, ISO 8601 with a timezone offset (Z or ±hh:mm)' })
	@IsISO8601({ strict: true })
	@Matches(ISO_WITH_OFFSET, { message: 'endTime must include a timezone offset (Z or ±hh:mm)' })
	endTime: string;

	// Both or neither: enforced by the calendar_events_location_pair_check CHECK in 012_calendar.sql
	@ApiPropertyOptional({ example: 41.905333, nullable: true, description: 'Latitude in decimal degrees, at full precision; null if no location set. Must be sent together with longitude' })
	@IsOptional()
	@IsNumber()
	@Min(-90)
	@Max(90)
	latitude?: number | null;

	@ApiPropertyOptional({ example: 12.542861, nullable: true, description: 'Longitude in decimal degrees, at full precision; null if no location set. Must be sent together with latitude' })
	@IsOptional()
	@IsNumber()
	@Min(-180)
	@Max(180)
	longitude?: number | null;
}