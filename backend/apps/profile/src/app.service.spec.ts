import { AppService } from './app.service';
import { sendProfileLikeNotification, sendProfileUnlikeNotification } from './utils/notification';

// Hermetic: no database, no storage, no notification service, no .env.
jest.mock('./db/db.service', () => ({ DbService: class {} }));
jest.mock('./storage/storage.service', () => ({ StorageService: class {} }));
jest.mock('./pictures/image.processor', () => ({ sanitizeImage: jest.fn(), PICTURE_OUTPUT_EXT: 'webp', PICTURE_OUTPUT_MIME: 'image/webp' }));
jest.mock('./utils/notification', () => ({
	sendProfileViewNotification: jest.fn(),
	checkIsUserOnline: jest.fn(),
	sendProfileLikeNotification: jest.fn(),
	sendProfileUnlikeNotification: jest.fn(),
	sendEventNotification: jest.fn(),
}));

const	notifyLike = sendProfileLikeNotification as jest.MockedFunction<typeof sendProfileLikeNotification>;
const	notifyUnlike = sendProfileUnlikeNotification as jest.MockedFunction<typeof sendProfileUnlikeNotification>;

const	ME = '11111111-1111-4111-8111-111111111111';
const	THEM = '22222222-2222-4222-8222-222222222222';

function	setup()
{
	const	db = {
		isBlocked: jest.fn(async () => false),
		hasAnyPicture: jest.fn(async () => true),
		addLikeAndMatch: jest.fn(async () => ({ created: true, nowMatched: true })),
		removeLikeAndUnmatch: jest.fn(async () => ({ removed: true, wasMatched: true })),
		addBlock: jest.fn(async () => ({ created: true, wasMatched: true })),
	};
	const	service = new AppService(db as any, {} as any, {} as any);

	// The failure is logged as a warning: keep the test output clean, and let tests check it.
	const	warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
	jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

	return ({ service, db, warn });
}

beforeEach(() =>
{
	notifyLike.mockReset();
	notifyUnlike.mockReset();
});

// The change is committed before the notification is sent: an unreachable notification service
// must not turn it into a 500, or the client retries, the retry is a no-op, and nobody is told.
describe('AppService: a saved change survives a failed notification', () =>
{
	const	down = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3002'), { code: 'ECONNREFUSED' });

	it('likeUser answers liked when the like/match notification fails', async () =>
	{
		const	{ service, db, warn } = setup();
		notifyLike.mockRejectedValue(down);

		await expect(service.likeUser(THEM, ME)).resolves.toEqual({ liked: true });
		expect(db.addLikeAndMatch).toHaveBeenCalledWith(ME, THEM);
		expect(notifyLike).toHaveBeenCalledWith(THEM, ME, true, expect.anything());
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('unlikeUser answers unliked when the unmatch notification fails', async () =>
	{
		const	{ service, db, warn } = setup();
		notifyUnlike.mockRejectedValue(down);

		await expect(service.unlikeUser(THEM, ME)).resolves.toEqual({ liked: false });
		expect(db.removeLikeAndUnmatch).toHaveBeenCalledWith(ME, THEM);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('blockUser answers blocked when the unmatch notification fails', async () =>
	{
		const	{ service, db, warn } = setup();
		notifyUnlike.mockRejectedValue(down);

		await expect(service.blockUser(THEM, ME)).resolves.toEqual({ blocked: true });
		expect(db.addBlock).toHaveBeenCalledWith(ME, THEM);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('still waits for the notification when it works (the frontend reads the match echo during the like)', async () =>
	{
		const	{ service, warn } = setup();
		let		sent = false;
		notifyLike.mockImplementation(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); sent = true; });

		await service.likeUser(THEM, ME);

		expect(sent).toBe(true);
		expect(warn).not.toHaveBeenCalled();
	});

	it('still answers 500 when the like itself fails', async () =>
	{
		const	{ service, db } = setup();
		jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
		db.addLikeAndMatch.mockRejectedValue(new Error('connection terminated'));

		await expect(service.likeUser(THEM, ME)).rejects.toMatchObject({ status: 500 });
		expect(notifyLike).not.toHaveBeenCalled();
	});
});
