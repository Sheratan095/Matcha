import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { Gender, SexualPreference } from '@repo/shared-types';
import { singleLine } from '@repo/utils';
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
	@Transform(({ value }) => singleLine(value))
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
