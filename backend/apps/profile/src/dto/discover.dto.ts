import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { InterestNamesProperty } from './interest.dto';

// Query parameters for GET /profile/discover: FILTERS ONLY, all optional. With no parameters the
// whole eligible list comes back in the weighted order.
//
// There is no sort parameter on purpose. The endpoint returns the complete filtered list and the
// frontend sorts it by age, distance, fame or common tags — every one of those is on the card —
// which is both instant for the user and the only correct way to do it client-side, since sorting
// a single page would reorder that page rather than the list.
//
// @Type(() => Number) is required on every numeric field: query strings arrive as strings and the
// global ValidationPipe runs with transform: true but WITHOUT enableImplicitConversion, so nothing
// else would coerce them and @IsInt would reject every request.
export class DiscoverQueryDto
{

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
	// Matching ANY of these is enough (see this endpoint's @ApiOperation). The user picks from
	// their own tags, so candidates sharing more of them simply rank higher on commonTagCount.
	@InterestNamesProperty()
	tags?: string[];
}

// One swipe card. Carries the four criteria the subject requires the list to be sortable by —
// age, distance, fame and common tags — because the frontend does that sorting.
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

	@ApiProperty({ example: 55, minimum: 0, maximum: 100, description: "The candidate's public fame rating" })
	fameRating: number;

	@ApiProperty({ example: 2, description: 'How many interest tags this candidate shares with you' })
	commonTagCount: number;

	@ApiPropertyOptional({ example: true, description: 'True when this candidate has already liked you, so liking back matches immediately. Present in discover only; search results omit it.' })
	likesYou?: boolean;

	@ApiProperty({ example: 'http://profile-pictures.web.garage.localhost:3902/seed/alice-1.webp', description: "The candidate's profile picture; never null, since a profile without one is not suggested" })
	profilePictureUrl: string;
}