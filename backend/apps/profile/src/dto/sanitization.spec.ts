import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { multiline, sanitizeDeep, SanitizeInputPipe, singleLine, stripUnsafeChars } from '@repo/utils';
import { UpdateProfileDto } from './profile/updateProfile.dto';
import { ReportUserDto } from './profile/reportUser.dto';
import { PostCalendarEventDto } from './calendar/calendar.dto';
import { DiscoverQueryDto } from './discover.dto';
import { SearchQueryDto } from './search.dto';

// INPUT SANITISATION / XSS regression tests.
//
// Every hostile character below is built from its code point, never typed or pasted: most are
// invisible, and a spec holding raw bidi controls would be the very attack it tests against.

const	cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const	NUL     = cp(0x0000);
const	RLO     = cp(0x202E); // right-to-left override
const	ZWSP    = cp(0x200B); // zero-width space
const	WJ      = cp(0x2060); // word joiner
const	BOM     = cp(0xFEFF);
const	LS      = cp(0x2028); // line separator
const	ZWNJ    = cp(0x200C);
const	LRM     = cp(0x200E);
const	ACUTE   = cp(0x0301); // combining acute accent
const	E_ACUTE = cp(0x00E9);
const	FAMILY  = cp(0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467); // man + ZWJ + woman + ZWJ + girl
const	GUITAR  = cp(0x1F3B8);
const	JAPAN   = cp(0x65E5, 0x672C, 0x8A9E);

// The same two global pipes main.ts registers, in the same order.
const	sanitizePipe   = new SanitizeInputPipe();
const	validationPipe = new ValidationPipe({ whitelist: true, transform: true });

async function	receive<T>(type: 'body' | 'query', metatype: new () => T, payload: unknown): Promise<T>
{
	const	sanitized = sanitizePipe.transform(payload, { type, metatype });

	return (await validationPipe.transform(sanitized, { type, metatype }));
}

// The validation messages of a rejected payload; fails the test if it was NOT rejected.
async function	rejection(promise: Promise<unknown>): Promise<string[]>
{
	try
	{
		await promise;
	}
	catch (error)
	{
		expect(error).toBeInstanceOf(BadRequestException);

		const	message = (error as BadRequestException).getResponse() as { message: string | string[] };

		return (Array.isArray(message.message) ? message.message : [message.message]);
	}

	throw (new Error('expected the payload to be rejected with a 400, but it was accepted'));
}

describe('stripUnsafeChars', () =>
{
	it('removes NUL and other C0 / C1 control characters but keeps TAB, LF and CR', () =>
	{
		expect(stripUnsafeChars(`a${NUL}b${cp(0x01)}c${cp(0x7F)}d${cp(0x85)}e\tf\ng\rh`)).toBe('abcde\tf\ng\rh');
	});

	it('removes bidi overrides, isolates, zero-width space, word joiner and BOM', () =>
	{
		const	hostile = `a${RLO}b${cp(0x202A)}c${cp(0x2066)}d${cp(0x2069)}e${ZWSP}f${WJ}g${BOM}h`;

		expect(stripUnsafeChars(hostile)).toBe('abcdefgh');
	});

	it('keeps what real text needs: ZWJ emoji sequences, ZWNJ, LRM / RLM', () =>
	{
		const	legitimate = `${FAMILY} ${ZWNJ} ${LRM} ${cp(0x200F)}`;

		expect(stripUnsafeChars(legitimate)).toBe(legitimate);
	});

	it('turns line and paragraph separators into newlines', () =>
	{
		expect(stripUnsafeChars(`a${LS}b${cp(0x2029)}c`)).toBe('a\nb\nc');
	});

	it('normalises to NFC, so a decomposed accent equals the composed letter', () =>
	{
		expect(stripUnsafeChars(`cafe${ACUTE}`)).toBe(`caf${E_ACUTE}`);
	});

	it('does NOT HTML-escape: escaping is the renderer\'s job, and it would double-encode "<3"', () =>
	{
		expect(stripUnsafeChars('<3 a < b & "c"')).toBe('<3 a < b & "c"');
		expect(stripUnsafeChars('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
	});
});

describe('singleLine / multiline', () =>
{
	it('singleLine folds every whitespace run, newlines included, into one space', () =>
	{
		expect(singleLine('  a \n\t b\r\n c  ')).toBe('a b c');
	});

	it('multiline normalises line breaks, drops trailing spaces and caps blank lines at one', () =>
	{
		expect(multiline('  one  \r\ntwo\r\r\r\r\nthree\n\n\n\nfour  ')).toBe('one\ntwo\n\nthree\n\nfour');
	});

	it.each([['singleLine', singleLine], ['multiline', multiline]] as const)('%s leaves a non-string for @IsString to reject', (_name, fn) =>
	{
		const	list = ['x'];

		expect(fn(42)).toBe(42);
		expect(fn(null)).toBeNull();
		expect(fn(undefined)).toBeUndefined();
		expect(fn(list)).toBe(list);
	});
});

describe('sanitizeDeep / SanitizeInputPipe', () =>
{
	it('cleans strings at every depth, in objects and arrays', () =>
	{
		const	cleaned = sanitizeDeep({ a: `x${NUL}`, b: [`y${RLO}`, { c: `z${ZWSP}` }], n: 5, t: true, none: null });

		expect(cleaned).toEqual({ a: 'x', b: ['y', { c: 'z' }], n: 5, t: true, none: null });
	});

	it('leaves a password byte for byte', () =>
	{
		const	password = `p${ZWSP}${RLO}w`;

		expect(sanitizeDeep({ username: `u${ZWSP}`, password })).toEqual({ username: 'u', password });
	});

	it('drops an own "__proto__" key instead of re-pointing the copy\'s prototype', () =>
	{
		const	hostile = JSON.parse('{"__proto__":{"polluted":true},"a":"b"}');
		const	cleaned = sanitizeDeep(hostile) as Record<string, unknown>;

		expect(Object.getPrototypeOf(cleaned)).toBe(Object.prototype);
		expect(Object.keys(cleaned)).toEqual(['a']);
		expect((cleaned as any).polluted).toBeUndefined();
	});

	it('rejects a payload nested too deeply with a 400, however deep it is, without overflowing the stack', () =>
	{
		const	nest = (levels: number): unknown =>
		{
			let	value: unknown = 'x';

			for (let i = 0; i < levels; i++)
				value = [value];

			return (value);
		};

		expect(() => sanitizeDeep(nest(5))).not.toThrow();
		expect(() => sanitizeDeep(nest(50))).toThrow(BadRequestException);
		expect(() => sanitizeDeep(nest(100_000))).toThrow(BadRequestException);
	});

	it('only touches body, query and param; custom decorators (the user id, uploads) pass through', () =>
	{
		const	value = `id${NUL}`;

		expect(sanitizePipe.transform(value, { type: 'custom' })).toBe(value);
		expect(sanitizePipe.transform(value, { type: 'body' })).toBe('id');
		expect(sanitizePipe.transform(value, { type: 'query' })).toBe('id');
		expect(sanitizePipe.transform(value, { type: 'param' })).toBe('id');
	});
});

describe('PATCH /profile: biography', () =>
{
	it('stores text as typed, markup included: it is escaped on render, not mangled on the way in', async () =>
	{
		const	dto = await receive('body', UpdateProfileDto, { biography: '<3 coffee & <b>books</b>' });

		expect(dto.biography).toBe('<3 coffee & <b>books</b>');
	});

	it('strips control and invisible characters, and normalises line breaks', async () =>
	{
		const	dto = await receive('body', UpdateProfileDto, { biography: `  hi${NUL}${RLO}\r\n\r\n\r\n\r\nthere${ZWSP}  ` });

		expect(dto.biography).toBe('hi\n\nthere');
	});

	it('measures the 500-character limit on what will be stored, not on what was sent', async () =>
	{
		const	padded = 'a'.repeat(500) + ZWSP.repeat(50);

		expect((await receive('body', UpdateProfileDto, { biography: padded })).biography).toHaveLength(500);
		await rejection(receive('body', UpdateProfileDto, { biography: 'a'.repeat(501) }));
	});

	it('answers a non-string with a 400, not a crash', async () =>
	{
		await rejection(receive('body', UpdateProfileDto, { biography: { $ne: '' } }));
		await rejection(receive('body', UpdateProfileDto, { biography: 12345 }));
	});

	it('removes a NUL from a name, which would otherwise make Postgres answer 500', async () =>
	{
		const	dto = await receive('body', UpdateProfileDto, { firstName: `Ali${NUL}ce` });

		expect(dto.firstName).toBe('Alice');
	});
});

describe('PATCH /profile: interest tags (the one text field shared by every user)', () =>
{
	it('normalises: lowercase, no leading #, inner spaces collapsed, NFC, duplicates removed', async () =>
	{
		const	dto = await receive('body', UpdateProfileDto, { interests: ['  #Vegan ', 'Rock   N  Roll', `cafe${ACUTE}`, 'vegan'] });

		expect(dto.interests).toEqual(['vegan', 'rock n roll', `caf${E_ACUTE}`]);
	});

	it('accepts real-world tags: punctuation, accents, other alphabets, emoji and ZWJ emoji', async () =>
	{
		const	tags = ['c++', 'c#', "it's", 'sci-fi', 'dr.who', 'snake_case', JAPAN, `${GUITAR} guitar`, FAMILY];
		const	dto = await receive('body', UpdateProfileDto, { interests: tags });

		expect(dto.interests).toEqual(tags);
	});

	it('strips control characters inside a tag instead of rejecting the whole request', async () =>
	{
		const	dto = await receive('body', UpdateProfileDto, { interests: [`ve${NUL}${ZWSP}gan`] });

		expect(dto.interests).toEqual(['vegan']);
	});

	it('treats a lone "#" as empty and drops it', async () =>
	{
		expect((await receive('body', UpdateProfileDto, { interests: ['#', '  '] })).interests).toEqual([]);
	});

	const	HOSTILE_TAGS = [
		'<script>alert(1)</script>',
		'<img src=x onerror=alert(1)>',
		'"><svg/onload=alert(1)>',
		'javascript:alert(1)',
		"a'); DROP TABLE users;--",
		'a&b',
		'a,b',
		'a/b',
		'a\\b',
		'a=b',
		'`x`',
		'{{7*7}}',
		'${x}',
		'%3Cscript%3E',
		'(x)',
		'-leading-hyphen',
		'.leading-dot',
		"'leading-quote",
	];

	it.each(HOSTILE_TAGS)('rejects %j with a 400', async (tag) =>
	{
		const	messages = await rejection(receive('body', UpdateProfileDto, { interests: [tag] }));

		expect(messages.join(' ')).toMatch(/interest/i);
	});

	it('still enforces the existing limits: 20 tags, 50 characters each', async () =>
	{
		await rejection(receive('body', UpdateProfileDto, { interests: Array.from({ length: 21 }, (_v, i) => `tag${i}`) }));
		await rejection(receive('body', UpdateProfileDto, { interests: ['a'.repeat(51)] }));
		expect((await receive('body', UpdateProfileDto, { interests: ['a'.repeat(50)] })).interests).toHaveLength(1);
	});

	it('applies the same allow-list to the ?tags= filter, in its comma-separated form', async () =>
	{
		expect((await receive('query', DiscoverQueryDto, { tags: 'Hiking,#Yoga' })).tags).toEqual(['hiking', 'yoga']);
		await rejection(receive('query', DiscoverQueryDto, { tags: 'hiking,<b>' }));
	});
});

describe('POST /:userId/report: reason', () =>
{
	it('is folded onto one clean line', async () =>
	{
		const	dto = await receive('body', ReportUserDto, { reason: `spam${NUL}\nfake\taccount${RLO}  ` });

		expect(dto.reason).toBe('spam fake account');
	});

	it('is limited to 128 characters', async () =>
	{
		await rejection(receive('body', ReportUserDto, { reason: 'a'.repeat(129) }));
	});
});

describe('POST /calendar: event', () =>
{
	const	event = {
		inviteeId: '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963',
		title:     'Coffee',
		startTime: '2099-01-01T10:00:00+01:00',
		endTime:   '2099-01-01T11:00:00+01:00',
	};

	it('folds the title onto one line and keeps the description multi-line', async () =>
	{
		const	dto = await receive('body', PostCalendarEventDto, { ...event, title: `  Cof${NUL}fee\n at\t5  `, description: `  line one\r\n\r\n\r\n\r\nline two${ZWSP}  ` });

		expect(dto.title).toBe('Coffee at 5');
		expect(dto.description).toBe('line one\n\nline two');
	});

	it('rejects a title that is empty once cleaned', async () =>
	{
		await rejection(receive('body', PostCalendarEventDto, { ...event, title: `${ZWSP}  \n ${RLO}` }));
	});

	it('rejects an invitee that is not a UUID with a 400 before it reaches the database', async () =>
	{
		await rejection(receive('body', PostCalendarEventDto, { ...event, inviteeId: "1' OR '1'='1" }));
		await rejection(receive('body', PostCalendarEventDto, { ...event, inviteeId: 'user123' }));
	});
});

describe('GET /profile/search: q', () =>
{
	it('is folded onto one clean line', async () =>
	{
		expect((await receive('query', SearchQueryDto, { q: ` ali${NUL}\n ` })).q).toBe('ali');
	});

	it('is rejected as empty when it holds nothing but invisible characters', async () =>
	{
		await rejection(receive('query', SearchQueryDto, { q: `${ZWSP}${RLO}${WJ}` }));
	});
});
