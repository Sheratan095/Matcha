import { NotificationType } from '@repo/shared-types';
import { EventStartWatcher } from './eventStartWatcher';
import { sendEventNotification } from '../utils/notification';

// Hermetic: no database, no notification service, no .env.
jest.mock('../db/db.service', () => ({ DbService: class {} }));
jest.mock('../utils/notification', () => ({ sendEventNotification: jest.fn() }));

const	notify = sendEventNotification as jest.MockedFunction<typeof sendEventNotification>;

function	event(id: string, startTime: string)
{
	return ({
		eventId: id, inviterId: 'inviter-' + id, inviteeId: 'invitee-' + id,
		title: 'Drinks ' + id, description: null,
		startTime, endTime: '2026-11-20T22:00:00.000Z',
		status: 'accepted', latitude: null, longitude: null, createdAt: '2026-11-18T09:00:00.000Z',
	});
}

function	setup(lookups: Array<() => Promise<unknown[]>>)
{
	const	calls: Array<{ after: Date, until: Date }> = [];
	const	db = {
		getEventsStartingBetween: jest.fn(async (after: Date, until: Date) =>
		{
			calls.push({ after, until });
			const	next = lookups.shift();
			return (next ? next() : []);
		}),
	};
	const	http = { post: jest.fn() };
	const	watcher = new EventStartWatcher(db as any, http as any);
	return ({ watcher, calls, http });
}

const	at = (iso: string) => new Date(iso);

beforeEach(() =>
{
	notify.mockReset();
	notify.mockResolvedValue(undefined);
});

describe('EventStartWatcher', () =>
{
	it('announces each date that started since the last pass, once, to both sides', async () =>
	{
		const	{ watcher, calls, http } = setup([
			async () => [event('a', '2026-11-20T20:00:00.000Z'), event('b', '2026-11-20T20:00:10.000Z')],
			async () => [],
		]);

		expect(await watcher.tick(at('2026-11-20T20:00:30.000Z'))).toBe(2);
		expect(await watcher.tick(at('2026-11-20T20:01:00.000Z'))).toBe(0);

		// the second pass starts where the first one stopped
		expect(calls[1].after).toEqual(at('2026-11-20T20:00:30.000Z'));
		expect(calls[1].until).toEqual(at('2026-11-20T20:01:00.000Z'));

		expect(notify).toHaveBeenCalledTimes(2);
		expect(notify).toHaveBeenCalledWith('invitee-a', 'inviter-a', 'inviter-a', 'a', 'Drinks a', '2026-11-20T20:00:00.000Z', http, NotificationType.EVENT_START);
		expect(notify.mock.calls[1][3]).toBe('b');
	});

	it('keeps the window when the lookup fails, so the next pass covers it again', async () =>
	{
		const	{ watcher, calls } = setup([
			async () => { throw new Error('connection reset'); },
			async () => [event('a', '2026-11-20T20:00:00.000Z')],
		]);

		expect(await watcher.tick(at('2026-11-20T20:00:30.000Z'))).toBe(0);
		expect(await watcher.tick(at('2026-11-20T20:01:00.000Z'))).toBe(1);

		expect(calls[1].after).toEqual(calls[0].after);
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('one failed notification does not hold back the others', async () =>
	{
		const	{ watcher } = setup([async () => [event('a', '2026-11-20T20:00:00.000Z'), event('b', '2026-11-20T20:00:05.000Z')]]);
		notify.mockRejectedValueOnce(new Error('notification service down'));

		expect(await watcher.tick(at('2026-11-20T20:00:30.000Z'))).toBe(2);
		expect(notify).toHaveBeenCalledTimes(2);
		expect(notify.mock.calls[1][3]).toBe('b');
	});

	it('does not overlap a pass that is still running', async () =>
	{
		let		release: (rows: unknown[]) => void = () => {};
		const	{ watcher, calls } = setup([() => new Promise((resolve) => { release = resolve; })]);

		const	first = watcher.tick(at('2026-11-20T20:00:30.000Z'));
		expect(await watcher.tick(at('2026-11-20T20:00:31.000Z'))).toBe(0);
		release([event('a', '2026-11-20T20:00:00.000Z')]);

		expect(await first).toBe(1);
		expect(calls).toHaveLength(1);
		expect(notify).toHaveBeenCalledTimes(1);
	});
});
