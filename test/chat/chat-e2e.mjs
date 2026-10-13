import { io } from 'socket.io-client';

// End-to-end chat tester driving TWO users (testuser + alice) through the gateway.
//
// It logs both in, opens both notification sockets (forwarding the httpOnly auth cookies in the
// handshake, like a browser), ensures they are matched (so a chat exists), then exercises every
// chat endpoint and asserts the realtime events + status transitions:
//   POST /chat/message        send  (A -> B), B receives 'message' live, status -> delivered
//   GET  /chat                list  (the conversation shows up with its chatId)
//   GET  /chat/:chatId        history (B reads -> B's view marks A's message read, A gets 'chat-seen')
//   plus negative cases: self-message (400), non-match (403), foreign chat history (403)
//
// Zero assertions library — just a tiny check() that tallies failures and sets the exit code,
// so it doubles as a CI smoke test. Needs socket.io-client (npm install).
//
// Run (stack up, DB migrated + seeded, the two users matched-able):
//   cd backend/test/chat && npm install && npm run test:chat
//   GATEWAY_URL=http://localhost:3000 USER_A=testuser USER_B=alice node chat-e2e.mjs

const	GATEWAY_URL   = process.env.GATEWAY_URL || 'http://localhost:3000';
const	USER_A        = { username: process.env.USER_A || 'testuser', password: process.env.PASS_A || '1234' };
const	USER_B        = { username: process.env.USER_B || 'alice',    password: process.env.PASS_B || '1234' };
const	EVENT_TIMEOUT = Number(process.env.EVENT_TIMEOUT || 5000); // well under the 10s realtime budget

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

// Every gateway call carries the user's cookie; returns { status, body } with body parsed as JSON
// when possible.
async function api(method, path, cookie, body)
{
	const	res = await fetch(`${GATEWAY_URL}${path}`,
	{
		method,
		headers: { 'Content-Type': 'application/json', Cookie: cookie },
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

	// Log every inbound event so a run doubles as a live trace.
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

// Resolves with the event payload, or null if nothing arrives within EVENT_TIMEOUT.
function waitForEvent(socket, event)
{
	return (new Promise(resolve =>
	{
		const	timer = setTimeout(() => resolve(null), EVENT_TIMEOUT);

		socket.once(event, payload =>
		{
			clearTimeout(timer);
			resolve(payload);
		});
	}));
}

async function main()
{
	console.log(`Gateway: ${GATEWAY_URL}  (A=${USER_A.username}, B=${USER_B.username})\n`);

	// --- auth + identity ------------------------------------------------------
	const	cookieA = await login(USER_A);
	const	cookieB = await login(USER_B);
	const	idA = await getUserId(cookieA);
	const	idB = await getUserId(cookieB);

	check('resolved both user ids', Boolean(idA && idB && idA !== idB), `A=${idA} B=${idB}`);

	// --- sockets --------------------------------------------------------------
	const	sockA = connectSocket(cookieA, USER_A.username);
	const	sockB = connectSocket(cookieB, USER_B.username);

	await waitConnect(sockA, USER_A.username);
	await waitConnect(sockB, USER_B.username);
	check('both sockets connected', true);

	// --- establish a match so a chat exists -----------------------------------
	// Each likes the other; a mutual like creates the chat. (Liking requires the liker to have a
	// profile picture — if this 403s, seed pictures for the two users first.)
	const	likeAB = await api('POST', `/profile/${idB}/like`, cookieA);
	const	likeBA = await api('POST', `/profile/${idA}/like`, cookieB);

	console.log(`  (setup) like A->B: ${likeAB.status}, B->A: ${likeBA.status}`);
	if (likeAB.status === 403 || likeBA.status === 403)
		console.warn('  \x1b[33mNOTE\x1b[0m liking returned 403 — the users likely need a profile picture; chat tests will fail until they are matched.');

	// --- send: A -> B ---------------------------------------------------------
	const	messageAtB = waitForEvent(sockB, 'message');   // B should receive it live
	const	seenAtA    = waitForEvent(sockA, 'chat-seen');  // later, when B opens the chat

	const	send = await api('POST', '/chat/message', cookieA, { toUserId: idB, content: 'hey alice' });

	check('POST /chat/message -> 200', send.status === 200, `status=${send.status} body=${JSON.stringify(send.body)}`);

	const	live = await messageAtB;

	check("B received 'message' over WS", live !== null, 'no message event within timeout');
	if (live)
		check('delivered payload content matches', live.content === 'hey alice', JSON.stringify(live));

	// --- list: A --------------------------------------------------------------
	const	list = await api('GET', '/chat', cookieA);

	check('GET /chat -> 200', list.status === 200);

	const	convo = Array.isArray(list.body?.chats) ? list.body.chats.find(c => c.userId === idB) : null;

	check('conversation appears in A\'s list with a chatId', Boolean(convo?.chatId), JSON.stringify(list.body));
	check('list preview shows the last message', convo?.lastMessage === 'hey alice', JSON.stringify(convo));

	const	chatId = convo?.chatId;

	if (chatId)
	{
		// A reads its own view: its outgoing message should already be 'delivered' (B was online),
		// and reading as the sender must NOT change its own message's status.
		const	histA = await api('GET', `/chat/${chatId}`, cookieA);
		const	mineAtA = histA.body?.messages?.find(m => m.content === 'hey alice');

		check('GET /chat/:chatId -> 200 (A)', histA.status === 200);
		check("A's sent message status is 'delivered'", mineAtA?.status === 'delivered', `status=${mineAtA?.status}`);

		// B opens the chat: marks A's message read + pushes 'chat-seen' to A.
		const	histB = await api('GET', `/chat/${chatId}`, cookieB);
		const	msgAtB = histB.body?.messages?.find(m => m.content === 'hey alice');

		check('GET /chat/:chatId -> 200 (B)', histB.status === 200);
		check('history contains the message', Boolean(msgAtB), JSON.stringify(histB.body));

		const	seen = await seenAtA;

		check("A received 'chat-seen' over WS after B read", seen !== null, 'no chat-seen within timeout');

		// Re-fetch: the message is now 'read'.
		const	histB2 = await api('GET', `/chat/${chatId}`, cookieB);
		const	msgRead = histB2.body?.messages?.find(m => m.content === 'hey alice');

		check("message status is 'read' after B opened the chat", msgRead?.status === 'read', `status=${msgRead?.status}`);
	}

	// --- negative cases -------------------------------------------------------
	const	self = await api('POST', '/chat/message', cookieA, { toUserId: idA, content: 'x' });

	check('message to self -> 400', self.status === 400, `status=${self.status}`);

	const	strangerId = '00000000-0000-4000-8000-000000000000';
	const	nonMatch = await api('POST', '/chat/message', cookieA, { toUserId: strangerId, content: 'x' });

	check('message to a non-match -> 403', nonMatch.status === 403, `status=${nonMatch.status}`);

	const	foreign = await api('GET', `/chat/${strangerId}`, cookieA);

	check('history of a chat you are not in -> 403', foreign.status === 403, `status=${foreign.status}`);

	sockA.close();
	sockB.close();

	console.log(`\n${failures === 0 ? '\x1b[32mALL CHECKS PASSED\x1b[0m' : `\x1b[31m${failures} CHECK(S) FAILED\x1b[0m`}`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch(err =>
{
	console.error(`\x1b[31mFATAL\x1b[0m ${err.message}`);
	process.exit(1);
});
