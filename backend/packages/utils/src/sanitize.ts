import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// INPUT SANITISATION, shared by every service.
//
// The rule this file implements is "sanitise on the way IN, encode on the way OUT":
//   - OUT (HTML, attributes, emails) is the job of whoever renders: React escapes text by
//     default, the mailer escapes every template value (see mailer.service.ts).
//   - IN is the job of this file, and it deliberately does NOT HTML-escape. Escaping at the door
//     would store "&lt;3" for "<3", double-encode on the next render, and still be wrong for any
//     non-HTML consumer (the SQL search, emails' plain-text part, logs).
// What IS removed on the way in is what no honest user types and what makes trouble downstream:
// control characters (a NUL makes Postgres reject the whole statement with a 500), and the
// invisible characters used to spoof or hide text.

// The code points removed, as inclusive [from, to] ranges.
//
// They are written as NUMBERS on purpose, not as "\uXXXX" escapes or literal characters: most of
// them are invisible, and a source file holding raw bidi controls is exactly the "Trojan Source"
// attack this list defends against. Numbers cannot be turned into the characters by an editor,
// a formatter or a copy-paste.
//
//   0000-0008, 000B, 000C, 000E-001F  C0 controls, except TAB (09), LF (0A) and CR (0D)
//   007F-009F                         DEL and the C1 controls (NEL, 0085, included)
//   200B, 2060, FEFF                  zero-width space, word joiner, BOM: invisible, so they make
//                                     an "empty-looking" message or a name that looks like another
//   202A-202E, 2066-2069              bidi embeddings, overrides and isolates: they reorder the
//                                     text on screen ("Trojan Source" / display spoofing)
//
// Deliberately KEPT:
//   200C, 200D (ZWNJ, ZWJ)            emoji sequences (family, skin tones, professions) and
//                                     Persian / Indic scripts are written with them
//   200E, 200F (LRM, RLM)             harmless marks that mixed Arabic / Hebrew text relies on
const	UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> =
[
	[0x0000, 0x0008], [0x000B, 0x000C], [0x000E, 0x001F],
	[0x007F, 0x009F],
	[0x200B, 0x200B], [0x2060, 0x2060], [0xFEFF, 0xFEFF],
	[0x202A, 0x202E], [0x2066, 0x2069],
];

// A regex character class holding every range above. Built at load time from the numbers, so no
// invisible character ever appears in this source file. None of the characters involved is special
// inside a class (no backslash, bracket, caret), so they can be placed in it as they are.
const	UNSAFE_CHARS = new RegExp(`[${UNSAFE_RANGES
	.map(([from, to]) => String.fromCharCode(from) + (to > from ? `-${String.fromCharCode(to)}` : ''))
	.join('')}]`, 'g');

// U+2028 / U+2029 (line and paragraph separator): real line breaks that JSON and JavaScript
// source treat specially. Kept as the newline they mean.
const	LINE_SEPARATOR = String.fromCharCode(0x2028);
const	PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

// Deep enough for any DTO in this codebase (the deepest is an object holding an array of strings),
// shallow enough that a body of 100 000 nested "[" cannot overflow the stack of the walker below.
const	MAX_DEPTH = 8;

// Fields whose value must reach the service byte for byte. A password is hashed, never rendered,
// so altering it would only change what the user typed; its length and format are validated by
// the DTO instead.
const	UNTOUCHED_KEYS = new Set(['password']);

/**
 * @brief Remove control and invisible characters from a string and normalise it to Unicode NFC.
 *
 * NFC so an accented letter typed as ONE character and as a base letter + a combining accent
 * become the SAME string: otherwise two interest tags that look identical would be two rows, and
 * a search for one would miss the other.
 */
export function	stripUnsafeChars(value: string): string
{
	return (value
		.replaceAll(LINE_SEPARATOR, '\n')
		.replaceAll(PARAGRAPH_SEPARATOR, '\n')
		.replace(UNSAFE_CHARS, '')
		.normalize('NFC'));
}

/**
 * @brief Normalise a SINGLE-LINE text field: any run of whitespace (tabs and newlines included)
 * becomes one space, then trimmed. For titles, reasons, search text.
 *
 * Meant for `@Transform(({ value }) => singleLine(value))`. Anything that is not a string is
 * returned untouched, so `@IsString()` can report the real type error as a 400 instead of this
 * helper turning it into a 500.
 */
export function	singleLine(value: unknown): unknown
{
	if (typeof value !== 'string')
		return (value);

	return (stripUnsafeChars(value).replace(/\s+/g, ' ').trim());
}

/**
 * @brief Normalise a MULTI-LINE text field: Windows / old-Mac line breaks become "\n", trailing
 * spaces are dropped, three or more newlines in a row become one blank line, then trimmed.
 * For biographies, chat messages and event descriptions.
 *
 * Same contract as singleLine for non-strings.
 */
export function	multiline(value: unknown): unknown
{
	if (typeof value !== 'string')
		return (value);

	return (stripUnsafeChars(value)
		.replace(/\r\n?/g, '\n')
		.replace(/[^\S\n]+$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim());
}

function	walk(value: unknown, depth: number): unknown
{
	if (typeof value === 'string')
		return (stripUnsafeChars(value));

	if (value === null || typeof value !== 'object')
		return (value);

	if (depth >= MAX_DEPTH)
		throw (new BadRequestException('Payload is nested too deeply'));

	if (Array.isArray(value))
		return (value.map((item) => walk(item, depth + 1)));

	const	copy: Record<string, unknown> = {};

	for (const [key, item] of Object.entries(value))
	{
		// JSON.parse makes "__proto__" an OWN key; assigning it below would re-point the copy's prototype.
		if (key === '__proto__')
			continue;

		copy[key] = UNTOUCHED_KEYS.has(key) ? item : walk(item, depth + 1);
	}

	return (copy);
}

/**
 * @brief Recursively strip control / invisible characters from every string in a request payload.
 *
 * Exported for tests; services use SanitizeInputPipe.
 *
 * @throws BadRequestException when the payload nests deeper than MAX_DEPTH.
 */
export function	sanitizeDeep(value: unknown): unknown
{
	return (walk(value, 0));
}

/**
 * @brief GLOBAL BACKSTOP: sanitises every string that arrives in a request body, query string or
 * path parameter, before validation sees it.
 *
 * Register it BEFORE the ValidationPipe so the DTO rules (lengths, regexes, @IsNotEmpty) judge the
 * text that will actually be stored:
 *
 *     app.useGlobalPipes(new SanitizeInputPipe(), new ValidationPipe({ whitelist: true, transform: true }));
 *
 * It is a backstop, not the whole policy. It removes what is never legitimate; what a FIELD may
 * contain (an interest tag's character set, whether a title may span lines) is decided per field in
 * the DTO, with singleLine / multiline / @Matches.
 *
 * Custom parameter decorators (@CurrentUser, @UploadedFile) are left alone: they carry
 * gateway-injected ids and binary data, not user text.
 */
@Injectable()
export class SanitizeInputPipe implements PipeTransform
{
	transform(value: unknown, metadata: ArgumentMetadata): unknown
	{
		if (metadata.type !== 'body' && metadata.type !== 'query' && metadata.type !== 'param')
			return (value);

		return (walk(value, 0));
	}
}
