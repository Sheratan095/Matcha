import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { InterestNamesProperty } from './interest.dto';

export const DISCOVER_PAGE_SIZE = 20;

// Query parameters for GET /profile/discover. Everything is optional: with no parameters at all
// the deck is the weighted "best" ordering, first page.
//
// @Type(() => Number) is required on every numeric field: query strings arrive as strings and the
// global ValidationPipe runs with transform: true but WITHOUT enableImplicitConversion, so nothing
// else would coerce them and @IsInt would reject every request.
export class DiscoverQueryDto
{
	@ApiPropertyOptional({ default: DISCOVER_PAGE_SIZE, minimum: 1, maximum: DISCOVER_PAGE_SIZE, description: 'Cards per page.' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(DISCOVER_PAGE_SIZE)
	limit: number = DISCOVER_PAGE_SIZE;

	@ApiPropertyOptional({ default: 0, minimum: 0, description: 'Cards to skip. The frontend advances this by `limit` to pull the next batch.' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset: number = 0;


	//--------------------------FILTERS--------------------------

	@ApiPropertyOptional({ example: 25, minimum: 18, maximum: 120, description: 'Minimum age, inclusive.' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(18)
	@Max(120)
	minAge?: number;

	@ApiPropertyOptional({ example: 40, minimum: 18, maximum: 120, description: 'Maximum age, inclusive.' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(18)
	@Max(120)
	maxAge?: number;

	@ApiPropertyOptional({ example: 40, minimum: 0, maximum: 100, description: 'Minimum fame rating, inclusive.' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(100)
	minFame?: number;

	@ApiPropertyOptional({ example: 100, minimum: 0, maximum: 100, description: 'Maximum fame rating, inclusive.' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(100)
	maxFame?: number;

	@ApiPropertyOptional({ example: 1, minimum: 0, maximum: 100, description: 'Minimum distance in whole kilometres, inclusive. Null when YOU have no location set.' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(100)
	minDistanceKm?: number;

	@ApiPropertyOptional({ example: 50, minimum: 0, maximum: 100, description: 'Maximum distance in whole kilometres, inclusive. Null when YOU have no location set.' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(100)
	maxDistanceKm?: number;

	// Same shared decorator as PATCH /profile, which is the point: a tag typed into the filter is
	// normalised exactly as it was when stored, so '#Hiking' here still matches 'hiking' there.
	// A candidate must carry EVERY tag listed (see this endpoint's @ApiOperation).
	@InterestNamesProperty()
	tags?: string[];
}

// One swipe card. The fame rating and the common-tag count are used to filter and sort server
// side but are NOT returned: a card is a photo with a name, an age and a distance over it.
export class DiscoverCardDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'Candidate user UUID' })
	userId: string;

	@ApiProperty({ example: 'alice', description: 'Username' })
	username: string;

	@ApiProperty({ example: 'Alice', nullable: true, description: 'First name' })
	firstName: string | null;

	@ApiProperty({ example: 25, description: 'Age in years, computed by the database from the date of birth' })
	age: number;

	@ApiProperty({ example: 4, nullable: true, description: 'Whole kilometres away, floored at 1; null when YOU have no location set. Derived from a ~1 km-snapped position.' })
	distanceKm: number | null;

	@ApiProperty({ example: true, description: 'True when this candidate has already liked you, so liking back matches immediately' })
	likesYou: boolean;

	@ApiProperty({ example: 'http://profile-pictures.web.garage.localhost:3902/seed/alice-1.webp', description: "The candidate's profile picture; never null, since a profile without one is not suggested" })
	profilePictureUrl: string;
}

export class DiscoverErrorDto
{
	@ApiProperty({ example: 500, description: 'HTTP status code' })
	statusCode: number;

	@ApiProperty({ example: 'Failed to fetch suggestions', description: 'Error message' })
	message: string;
}
