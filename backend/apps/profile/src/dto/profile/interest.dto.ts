import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, IsUUID, Matches, MaxLength, IsOptional } from 'class-validator';

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

// WHAT A TAG NAME MAY CONTAIN, an allow-list rather than a block-list.
//
// Tags are the one piece of free text that is SHARED: a tag one user types is stored once and
// then returned to every user by GET /profile/interests and used as a filter value. So unlike a
// biography (shown to whoever opens that one profile), a hostile name here lands in everybody's
// picker. It is also identifier-like, which makes a strict character set cheap:
//   - first character: a letter, a digit or an emoji (no leading punctuation, '#' is stripped before);
//   - then: letters (any alphabet), digits, combining marks (accents), emoji and their joiners
//     (zero-width joiner, variation selector 16), spaces, and . _ + # - plus the straight and curly
//     apostrophe (so "c++", "c#", "sci-fi", "rock n roll", "it's" pass).
// Everything that can open a tag, quote an attribute or break out of a context is out:
// < > " ` & / \ = ; : ( ) { } [ ] | % $ @ ! ? * ~ ^
// A comma is out because it is the list separator of ?tags=a,b: a tag containing one could be
// stored but never filtered on.
//
// frontend/src/wb/filters.ts (normaliseTags) cleans typed text to this same set, so the UI never
// sends a name this rejects; keep the two in step.
// The joiners and the curly apostrophe are written as code points, not literals: the first two
// are INVISIBLE, and an invisible character inside a regex is a trap for the next person to edit
// it. The hyphen stays LAST so it is a literal one and not the start of a range.
const	TAG_EXTRA_CHARS = `${String.fromCharCode(0x200D, 0xFE0F, 0x2019)} _.'+#-`;
export const INTEREST_NAME_PATTERN = new RegExp(
	String.raw`^[\p{L}\p{N}\p{Extended_Pictographic}][\p{L}\p{N}\p{M}\p{Extended_Pictographic}${TAG_EXTRA_CHARS}]*$`,
	'u',
);

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
//
// Inner whitespace is collapsed too ('foo   bar' -> 'foo bar'), for the same reason as the
// lowercasing: two spellings of one tag must not become two rows.
function normalizeInterestName(raw: string): string
{
	return (raw.trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ').toLowerCase());
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
		Matches(INTEREST_NAME_PATTERN, { each: true, message: "Each interest may only contain letters, numbers, emoji, spaces and . _ ' + # -" }),
	));
}
