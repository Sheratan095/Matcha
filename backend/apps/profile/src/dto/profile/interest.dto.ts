import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, IsOptional } from 'class-validator';

// THE single definition of an interest tag, for every DTO on both sides of the API:
//   - OUTGOING: InterestTagDto / InterestTagListDto, the { id, name } shape every response uses.
//   - INCOMING: @InterestNamesProperty(), the docs + validation + normalisation a list of tag
//     NAMES gets.
// Imported by profile.dto, getInterests.dto, updateProfile.dto and discover.dto, so the rules
// cannot drift between the endpoint that STORES tags and the endpoint that FILTERS by them.
//
// The two sides are deliberately DIFFERENT TYPES and cannot be collapsed into one. A request can
// only carry names: ids are minted by the database, which upserts each name and returns its id
// (see DbService.updateProfile), so a tag the user has just typed has no id to send yet. A
// response carries ids because by then the rows exist and the frontend needs them.

export const MAX_INTEREST_NAME_LENGTH = 50; // matches interest_tags.name VARCHAR(50)
export const MAX_INTERESTS_PER_USER   = 20;

// An interest tag as it leaves the API. Stored and returned WITHOUT the leading '#': the
// frontend adds it for display.
export class InterestTagDto
{
	@ApiProperty({ example: 'a1b2c3d4-...', description: 'Tag UUID' })
	@IsUUID()
	id: string;

	@ApiProperty({ example: 'vegan', description: 'Tag name without leading #' })
	@IsString()
	name: string;
}

// A list of tags as it leaves the API, for the responses that return nothing else. OUTGOING
// only: no @InterestNamesProperty() here, because that decorator validates incoming NAMES and
// this carries { id, name } objects.
export class InterestTagListDto
{
	@ApiProperty({ type: [InterestTagDto], description: 'Interest tags' })
	interests: InterestTagDto[];
}

// The canonical form of ONE tag name, and the only place it is defined:
//   '  #Vegan ' -> 'vegan'
// Lowercased because interest_tags.name is UNIQUE and '#Vegan' must not become a second row
// next to 'vegan'; the leading '#' is stripped because the UI shows tags as #hashtags but the
// column stores them bare.
function normalizeInterestName(raw: string): string
{
	return (raw.trim().replace(/^#+/, '').trim().toLowerCase());
}

// Accepts BOTH shapes a tag list arrives in, which is why this lives in one helper rather than
// being written twice: a JSON array from PATCH /profile, or a comma-separated string from the
// ?tags= query parameter on GET /profile/discover.
//
// Anything that is neither is passed through untouched so @IsArray reports the real type error
// instead of this function masking it.
function normalizeInterestNames(value: unknown): unknown
{
	const	list = typeof value === 'string' ? value.split(',') : value;

	if (!Array.isArray(list))
		return (value);

	// Non-string entries are KEPT, deliberately, so @IsString({ each: true }) can reject them with
	// a 400. Dropping them here instead would be destructive: the junk would disappear, the
	// remaining (possibly empty) array would validate, and updateProfile — which treats this list
	// as a FULL REPLACEMENT — would silently wipe the user's interests.
	//
	// Deduplicated AFTER normalising, so ['vegan', '#Vegan'] collapses to one entry. Required,
	// not cosmetic: updateProfile inserts one user_interests row per entry, and two entries
	// resolving to the same tag would violate the (user_id, tag_id) primary key.
	return (Array.from(new Set(
		list
			.map((tag) => typeof tag === 'string' ? normalizeInterestName(tag) : tag)
			// Only empty strings go, which is what a trailing comma in ?tags=hiking, leaves behind.
			.filter((tag) => tag !== '')
	)));
}

// The WHOLE declaration of an incoming interest-name list: Swagger docs, validation and
// normalisation together, so a field needs nothing but `@InterestNamesProperty()`.
//
// The docs live HERE rather than at each call site because they describe the field's SHAPE, and
// the shape is identical everywhere. What differs between endpoints is what they then DO with
// the list — PATCH /profile replaces a profile's tags, GET /profile/discover filters candidates
// by them — and that belongs in each endpoint's @ApiOperation, not in the field.
//
// apiOptions stays as an escape hatch for a future call site that genuinely needs different
// wording; neither current one passes anything.
export function InterestNamesProperty(apiOptions: ApiPropertyOptions = {}): PropertyDecorator
{
	return (applyDecorators(
		ApiPropertyOptional({
			// Both accepted forms are spelled out, since a JSON body sends an array while a query
			// string sends one comma-separated value and the same decorator handles both.
			example: ['vegan', 'geek'],
			description: 'Interest tag names — a JSON array ["vegan","geek"] in a request body, or comma-separated (vegan,geek) in a query string. A leading # is stripped, names are lowercased, and duplicates are removed. Maximum 20 names of 50 characters each.',
			...apiOptions,
		}),
		IsOptional(),
		Transform(({ value }) => normalizeInterestNames(value)),
		IsArray(),
		ArrayMaxSize(MAX_INTERESTS_PER_USER),
		IsString({ each: true }),
		MaxLength(MAX_INTEREST_NAME_LENGTH, { each: true }),
	));
}
