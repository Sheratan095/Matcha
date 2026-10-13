import { io } from 'socket.io-client';

// End-to-end chat tester driving TWO users (testuser + alice) through the gateway.
//
// Covers the whole feature: match -> chat creation, send + live delivery, multi-device fan-out,
// sent -> delivered -> read transitions + read receipts, list, history, burst ordering, input
// validation, auth (401), the offline -> reconnect / pending-queue path, and teardown (unlike /
// block dissolve the chat). It also probes whether logout closes the socket (informational).
//
// Zero assertion lib — a tiny check() tallies failures and sets the exit code, so it doubles as a
// CI smoke test. Needs socket.io-client (npm install).
//
// Run (stack up, DB migrated + seeded, the two users matchable):
//   cd backend/test/chat && npm install && npm run test:chat

const	GATEWAY_URL   = process.env.GATEWAY_URL || 'http://localhost:3000';
const	USER_A        = { username: process.env.USER_A || 'testuser', password: process.env.PASS_A || '1234' };
const	USER_B        = { username: process.env.USER_B || 'alice',    password: process.env.PASS_B || '1234' };
const	EVENT_TIMEOUT = Number(process.env.EVENT_TIMEOUT || 5000); // well under the 10s realtime budget
const	OFFLINE_WAIT  = Number(process.env.OFFLINE_WAIT || 1500);  // let the server register a disconnect

let	failures = 0;

function check(label, ok, detail)
{
	if (ok)
		console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
	else
	{
		failures++;
		console.error(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ' — ' + detail : ''}`);
	}
}

function info(label, detail)
{
	console.log(`  \x1b[36mINFO\x1b[0m ${label}${detail ? ' — ' + detail : ''}`);
}

function sleep(ms)
{
	return (new Promise(resolve => setTimeout(resolve, ms)));
}

// Keep only the name=value part of each Set-Cookie line (drop Path/HttpOnly/… attributes).
function buildCookieHeader(setCookieLines)
{
	return (setCookieLines.map(line => line.split(';')[0].trim()).join('; '));
}

async function login(user)
{
	const	res = await fetch(`${GATEWAY_URL}/auth/login`,
	{
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(user),
	});

	if (!res.ok)
		throw new Error(`login ${user.username} failed: ${res.status} ${await res.text().catch(() => '')}`);

	const	lines = res.headers.getSetCookie?.() || [];

	if (lines.length === 0)
		throw new Error(`login ${user.username} returned no Set-Cookie`);

	return (buildCookieHeader(lines));
}

// Every gateway call; pass cookie = undefined to send NO auth (for the 401 checks). Returns
// { status, body } with body parsed as JSON when possible.
async function api(method, path, cookie, body)
{
	const	headers = { 'Content-Type': 'application/json' };

	if (cookie)
		headers.Cookie = cookie;

	const	res = await fetch(`${GATEWAY_URL}${path}`,
	{
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	const	text = await res.text();
	let		parsed;

	try
	{
		parsed = JSON.parse(text);
	}
	catch
	{
		parsed = text;
	}

	return ({ status: res.status, body: parsed });
}

async function getUserId(cookie)
{
	const	res = await api('GET', '/profile', cookie);

	return (res.body?.userId ?? null);
}

function connectSocket(cookie, label)
{
	const	socket = io(`${GATEWAY_URL}/notification`,
	{
		transports: ['websocket', 'polling'],
		extraHeaders: { Cookie: cookie },
		reconnection: false,
	});

	socket.onAny((event, payload) => console.log(`  [ws:${label}] ${event} ${JSON.stringify(payload)}`));

	return (socket);
}

function waitConnect(socket, label)
{
	return (new Promise((resolve, reject) =>
	{
		socket.on('connect', resolve);
		socket.on('connect_error', err => reject(new Error(`${label} socket connect_error: ${err.message}`)));
		setTimeout(() => reject(new Error(`${label} socket connect timeout`)), EVENT_TIMEOUT);
	}));
}

// Resolves with the first matching event payload, or null on timeout. When `predicate` is given,
// only a payload satisfying it resolves (others are ignored) — needed when several events of the
// same name may arrive.
function waitForEvent(socket, event, predicate)
{
	return (new Promise(resolve =>
	{
		const	timer = setTimeout(() =>
		{
			socket.off(event, handler);
			resolve(null);
		}, EVENT_TIMEOUT);

		function handler(payload)
		{
			if (predicate && !predicate(payload))
				return;

			clearTimeout(timer);
			socket.off(event, handler);
			resolve(payload);
		}

		socket.on(event, handler);
	}));
}

function waitForDisconnect(socket)
{
	return (new Promise(resolve =>
	{
		const	timer = setTimeout(() => resolve(false), EVENT_TIMEOUT);

		socket.once('disconnect', () =>
		{
			clearTimeout(timer);
			resolve(true);
		});
	}));
}

async function main()
{
	console.log(`Gateway: ${GATEWAY_URL}  (A=${USER_A.username}, B=${USER_B.username})\n`);

	const	MESSAGE = `e2e ${Date.now()}`; // unique per run so lookups never hit a stale copy

	// --- auth + identity ------------------------------------------------------
	const	cookieA = await login(USER_A);
	const	cookieB = await login(USER_B);
	const	idA = await getUserId(cookieA);
	const	idB = await getUserId(cookieB);

	check('resolved both user ids', Boolean(idA && idB && idA !== idB), `A=${idA} B=${idB}`);

	// --- sockets (B opens TWO, to test multi-device fan-out) ------------------
	const	sockA  = connectSocket(cookieA, USER_A.username);
	const	sockB  = connectSocket(cookieB, USER_B.username + '#1');
	const	sockB2 = connectSocket(cookieB, USER_B.username + '#2');

	await waitConnect(sockA, USER_A.username);
	await waitConnect(sockB, USER_B.username + '#1');
	await waitConnect(sockB2, USER_B.username + '#2');
	check('all sockets connected (A + B×2)', true);

	// --- establish a match so a chat exists -----------------------------------
	const	likeAB = await api('POST', `/profile/${idB}/like`, cookieA);
	const	likeBA = await api('POST', `/profile/${idA}/like`, cookieB);

	console.log(`  (setup) like A->B: ${likeAB.status}, B->A: ${likeBA.status}`);
	if (likeAB.status === 403 || likeBA.status === 403)
		console.warn('  \x1b[33mNOTE\x1b[0m liking returned 403 — the users likely need a profile picture; chat tests will fail until they are matched.');

	// --- send: A -> B, delivered to BOTH of B's devices -----------------------
	const	atB1    = waitForEvent(sockB,  'message', p => p.content === MESSAGE);
	const	atB2    = waitForEvent(sockB2, 'message', p => p.content === MESSAGE);
	const	seenAtA = waitForEvent(sockA,  'chat-seen');

	const	send = await api('POST', '/chat/message', cookieA, { toUserId: idB, content: MESSAGE });

	check('POST /chat/message -> 200', send.status === 200, `status=${send.status} body=${JSON.stringify(send.body)}`);

	const	[live1, live2] = await Promise.all([atB1, atB2]);

	check("B device #1 received 'message'", live1 !== null);
	check("B device #2 received 'message' (multi-device fan-out)", live2 !== null);

	// --- list -----------------------------------------------------------------
	const	list = await api('GET', '/chat', cookieA);

	check('GET /chat -> 200', list.status === 200);

	const	convo = Array.isArray(list.body?.chats) ? list.body.chats.find(c => c.userId === idB) : null;

	check('conversation listed with a chatId', Boolean(convo?.chatId), JSON.stringify(list.body));
	check('list preview shows the last message', convo?.lastMessage === MESSAGE, JSON.stringify(convo));

	const	chatId = convo?.chatId;

	// --- delivered -> read ----------------------------------------------------
	if (chatId)
	{
		const	histA = await api('GET', `/chat/${chatId}`, cookieA);
		const	mineAtA = histA.body?.messages?.find(m => m.content === MESSAGE);

		check('GET /chat/:chatId -> 200 (A)', histA.status === 200);
		check("A's sent message status is 'delivered'", mineAtA?.status === 'delivered', `status=${mineAtA?.status}`);

		const	histB = await api('GET', `/chat/${chatId}`, cookieB);

		check('GET /chat/:chatId -> 200 (B, pure read)', histB.status === 200);
		check('history contains the message', Boolean(histB.body?.messages?.find(m => m.content === MESSAGE)), JSON.stringify(histB.body));

		// Reading no longer marks read — B explicitly marks the chat seen, which flips A's message
		// to 'read' and pushes 'chat-seen' to A.
		const	seen = await api('POST', `/chat/${chatId}/seen`, cookieB);

		check('POST /chat/:chatId/seen -> 200 (B)', seen.status === 200, `status=${seen.status}`);
		check("A received 'chat-seen' after B marked seen", (await seenAtA) !== null);

		const	histB2 = await api('GET', `/chat/${chatId}`, cookieB);
		const	msgRead = histB2.body?.messages?.find(m => m.content === MESSAGE);

		check("message status is 'read' after B marked seen", msgRead?.status === 'read', `status=${msgRead?.status}`);

		// --- burst ordering ---------------------------------------------------
		const	burst = Array.from({ length: 5 }, (_, i) => `burst ${Date.now()} #${i}`);

		for (const text of burst)
			await api('POST', '/chat/message', cookieA, { toUserId: idB, content: text });

		const	histBurst = await api('GET', `/chat/${chatId}`, cookieA);
		const	all = histBurst.body?.messages || [];
		const	seq = all.map(m => m.content).filter(c => burst.includes(c));

		check('burst messages preserved in send order', JSON.stringify(seq) === JSON.stringify(burst), JSON.stringify(seq));

		// --- delta fetch (?after=<epoch ms cursor>) ---------------------------
		// Using the second-to-last message's timestamp as the cursor must return only the tail
		// (the final message), not the whole history. (ms-vs-µs truncation may re-include the
		// cursor message itself, so we assert "a small tail", which the client would dedupe.)
		const	cursorMsg = all[all.length - 2];
		const	lastMsg   = all[all.length - 1];

		if (cursorMsg && lastMsg)
		{
			const	delta = await api('GET', `/chat/${chatId}?after=${cursorMsg.timestamp}`, cookieA);
			const	ids   = (delta.body?.messages || []).map(m => m.messageId);

			check('?after returns only the newest messages (a delta, not the full history)',
				ids.includes(lastMsg.messageId) && ids.length >= 1 && ids.length <= 2 && ids.length < all.length,
				`got ${ids.length} of ${all.length}`);
		}
	}

	// --- input validation (expect 400, never 500) ----------------------------
	const	longText = 'x'.repeat(1001);
	const	cases =
	[
		['empty content',       { toUserId: idB, content: '' }],
		['content > 1000 chars', { toUserId: idB, content: longText }],
		['missing toUserId',    { content: 'x' }],
		['toUserId not a uuid',  { toUserId: 'not-a-uuid', content: 'x' }],
	];

	for (const [label, body] of cases)
	{
		const	res = await api('POST', '/chat/message', cookieA, body);

		check(`validation: ${label} -> 400`, res.status === 400, `status=${res.status}`);
	}

	// --- auth: no cookie -> 401 ----------------------------------------------
	check('unauth POST /chat/message -> 401', (await api('POST', '/chat/message', undefined, { toUserId: idB, content: 'x' })).status === 401);
	check('unauth GET /chat -> 401',          (await api('GET', '/chat', undefined)).status === 401);
	if (chatId)
		check('unauth GET /chat/:chatId -> 401', (await api('GET', `/chat/${chatId}`, undefined)).status === 401);

	// --- negative cases -------------------------------------------------------
	check('message to self -> 400', (await api('POST', '/chat/message', cookieA, { toUserId: idA, content: 'x' })).status === 400);

	const	strangerId = '00000000-0000-4000-8000-000000000000';

	check('message to a non-match -> 403', (await api('POST', '/chat/message', cookieA, { toUserId: strangerId, content: 'x' })).status === 403);
	check('history of a chat you are not in -> 403', (await api('GET', `/chat/${strangerId}`, cookieA)).status === 403);

	// --- offline -> reconnect / pending queue ---------------------------------
	const	offlineMsg = `offline ${Date.now()}`;

	sockB.close();
	sockB2.close();
	await sleep(OFFLINE_WAIT); // let the server process both disconnects (B now fully offline)

	const	offlineSend = await api('POST', '/chat/message', cookieA, { toUserId: idB, content: offlineMsg });

	check('offline send -> 200', offlineSend.status === 200, `status=${offlineSend.status}`);
	check('offline send reports not-delivered-live (false)', offlineSend.body === false, `body=${JSON.stringify(offlineSend.body)}`);

	const	sockB3    = connectSocket(cookieB, USER_B.username + '#reconnect');
	const	queued    = waitForEvent(sockB3, 'message', p => p.content === offlineMsg);

	await waitConnect(sockB3, USER_B.username + '#reconnect');

	check('queued message pushed on reconnect', (await queued) !== null, 'pending-queue push not received');
	if (chatId)
		check('offline message present in history', Boolean((await api('GET', `/chat/${chatId}`, cookieB)).body?.messages?.find(m => m.content === offlineMsg)));

	sockB3.close();

	// --- teardown: unlike dissolves the chat ----------------------------------
	check('DELETE /profile/:id/like -> 200', (await api('DELETE', `/profile/${idB}/like`, cookieA)).status === 200);
	if (chatId)
		check('history of the dissolved chat -> 403', (await api('GET', `/chat/${chatId}`, cookieA)).status === 403);
	check('message after unlike -> 403', (await api('POST', '/chat/message', cookieA, { toUserId: idB, content: 'x' })).status === 403);

	const	listGone = await api('GET', '/chat', cookieA);

	check('dissolved conversation no longer listed', Array.isArray(listGone.body?.chats) && !listGone.body.chats.some(c => c.userId === idB), JSON.stringify(listGone.body));

	// --- teardown: block dissolves the chat -----------------------------------
	await api('POST', `/profile/${idB}/like`, cookieA); // re-form the match (B still likes A) -> new chat

	check('POST /profile/:id/block -> 200', (await api('POST', `/profile/${idB}/block`, cookieA)).status === 200);
	check('message after block -> 403', (await api('POST', '/chat/message', cookieA, { toUserId: idB, content: 'x' })).status === 403);

	// Restore clean state for the next run (a lingering block would break the next like-setup).
	check('DELETE /profile/:id/block -> 200 (cleanup)', (await api('DELETE', `/profile/${idB}/block`, cookieA)).status === 200);

	// --- informational: does logout close the live socket? --------------------
	const	aClosed = waitForDisconnect(sockA);

	await api('POST', '/auth/logout', cookieA);
	info('logout closed A\'s socket?', String(await aClosed) + '  (false = socket outlives the session — decide if that is intended)');

	sockA.close();

	console.log(`\n${failures === 0 ? '\x1b[32mALL CHECKS PASSED\x1b[0m' : `\x1b[31m${failures} CHECK(S) FAILED\x1b[0m`}`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch(err =>
{
	console.error(`\x1b[31mFATAL\x1b[0m ${err.message}`);
	process.exit(1);
});
