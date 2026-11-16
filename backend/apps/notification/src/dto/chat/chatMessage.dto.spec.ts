import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SanitizeInputPipe } from '@repo/utils';
import { ChatMessageDto } from './chatMessage.dto';

// Chat content is the highest-volume free text in the system and is rendered to another user,
// so it gets its own regression tests. Hostile characters are built from code points: see
// apps/profile/src/dto/sanitization.spec.ts for why.

const	ZWSP = String.fromCodePoint(0x200B);
const	RLO  = String.fromCodePoint(0x202E);
const	NUL  = String.fromCodePoint(0x0000);

const	TO_USER_ID = '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963';

// The same two global pipes main.ts registers, in the same order.
const	sanitizePipe   = new SanitizeInputPipe();
const	validationPipe = new ValidationPipe({ whitelist: true, transform: true });

async function	receive(payload: unknown): Promise<ChatMessageDto>
{
	const	meta = { type: 'body' as const, metatype: ChatMessageDto };

	return (await validationPipe.transform(sanitizePipe.transform(payload, meta), meta));
}

describe('POST /chat/message: content', () =>
{
	it('stores a message as typed, markup included: the chat UI escapes on render', async () =>
	{
		const	dto = await receive({ toUserId: TO_USER_ID, content: '<3 <script>alert(1)</script> a < b' });

		expect(dto.content).toBe('<3 <script>alert(1)</script> a < b');
	});

	it('keeps line breaks but caps blank lines and trims', async () =>
	{
		const	dto = await receive({ toUserId: TO_USER_ID, content: '  hi\r\n\r\n\r\n\r\nthere  ' });

		expect(dto.content).toBe('hi\n\nthere');
	});

	it('strips control and bidi characters', async () =>
	{
		const	dto = await receive({ toUserId: TO_USER_ID, content: `he${NUL}llo ${RLO}world` });

		expect(dto.content).toBe('hello world');
	});

	it.each([
		['spaces',               '     '],
		['newlines and tabs',    '\n\n\t \r\n'],
		['zero-width spaces',    `${ZWSP}${ZWSP}${ZWSP}`],
		['invisible characters', `${ZWSP} ${RLO}\n${NUL}`],
	])('rejects a message made of nothing but %s', async (_label, content) =>
	{
		await expect(receive({ toUserId: TO_USER_ID, content })).rejects.toBeInstanceOf(BadRequestException);
	});

	it('measures the 1000-character limit on the cleaned text', async () =>
	{
		expect((await receive({ toUserId: TO_USER_ID, content: 'a'.repeat(1000) + ZWSP.repeat(100) })).content).toHaveLength(1000);
		await expect(receive({ toUserId: TO_USER_ID, content: 'a'.repeat(1001) })).rejects.toBeInstanceOf(BadRequestException);
	});

	it('answers a non-string with a 400, not a crash', async () =>
	{
		await expect(receive({ toUserId: TO_USER_ID, content: 123 })).rejects.toBeInstanceOf(BadRequestException);
		await expect(receive({ toUserId: TO_USER_ID, content: { $gt: '' } })).rejects.toBeInstanceOf(BadRequestException);
		await expect(receive({ toUserId: TO_USER_ID, content: ['hi'] })).rejects.toBeInstanceOf(BadRequestException);
	});
});
