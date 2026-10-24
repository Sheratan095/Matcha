import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { Gender, SexualPreference } from '@repo/shared-types';
import { DiscoverQueryDto } from './discover.dto';

const GENDERS: Gender[]                       = ['male', 'female', 'other'];
const SEXUAL_PREFERENCES: SexualPreference[]  = ['male', 'female', 'both', 'other'];

// ?genders=male,female arrives as ONE comma-separated string; a JSON-style repeated parameter
// arrives as an array. Both become a lowercased, deduplicated list. Anything else is passed
// through untouched so @IsArray reports the real type error.
function commaList(value: unknown): unknown
{
	const	list = typeof value === 'string' ? value.split(',') : value;

	if (!Array.isArray(list))
		return (value);

	return (Array.from(new Set(
		list
			.map((item) => typeof item === 'string' ? item.trim().toLowerCase() : item)
			.filter((item) => item !== '')
	)));
}

// Query parameters for GET /profile/search: every browsing filter (age, fame, distance from you,
// tags) plus the search-only ones below. All optional individually, but the service rejects a
// search with NO criterion at all.
//
// `tags` IS INHERITED BUT MEANS SOMETHING DIFFERENT HERE: A CANDIDATE MUST CARRY ALL OF THEM.
export class SearchQueryDto extends DiscoverQueryDto
{
	@ApiPropertyOptional({ example: 'ali', description: 'Case-insensitive substring of the username, first name, last name or "first last".' })
	@IsOptional()
	@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
	@IsString()
	@Length(1, 50)
	q?: string;

	@ApiPropertyOptional({ example: ['female', 'other'], enum: GENDERS, isArray: true, description: 'Candidate gender is any of these. Comma-separated in the query string (female,other).' })
	@IsOptional()
	@Transform(({ value }) => commaList(value))
	@IsArray()
	@IsIn(GENDERS, { each: true })
	genders?: Gender[];

	@ApiPropertyOptional({ example: ['both'], enum: SEXUAL_PREFERENCES, isArray: true, description: "Candidate's sexual preference is any of these (an unset one counts as 'both'). Comma-separated in the query string." })
	@IsOptional()
	@Transform(({ value }) => commaList(value))
	@IsArray()
	@IsIn(SEXUAL_PREFERENCES, { each: true })
	preferences?: SexualPreference[];
}

// One search result: the discover card's sortable fields without the like relation, which the
// full profile (GET /profile/:userId) carries.
export class SearchCardDto
{
	@ApiProperty({ example: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963', description: 'User UUID' })
	userId: string;

	@ApiProperty({ example: 'alice', description: 'Username' })
	username: string;

	@ApiProperty({ example: 'Alice', nullable: true, description: 'First name' })
	firstName: string | null;

	@ApiProperty({ example: 25, description: 'Age in years, computed by the database from the date of birth' })
	age: number;

	@ApiProperty({ example: 4, nullable: true, description: 'Whole kilometres away, floored at 1; null when YOU have no location set. Derived from a ~1 km-snapped position.' })
	distanceKm: number | null;

	@ApiProperty({ example: 55, minimum: 0, maximum: 100, description: "The user's public fame rating" })
	fameRating: number;

	@ApiProperty({ example: 2, description: 'How many interest tags this user shares with you' })
	commonTagCount: number;

	@ApiProperty({ example: 'http://profile-pictures.web.garage.localhost:3902/seed/alice-1.webp', description: "The user's profile picture; never null, since a profile without one is not returned" })
	profilePictureUrl: string;
}
