import { io } from 'socket.io-client';

// Manual end-to-end tester for the notification WebSocket.
//
// 1. Logs in through the gateway (POST /auth/login) to obtain the httpOnly
//    access_token / refresh_token cookies.
// 2. Opens the /notification socket.io connection, forwarding those cookies in
//    the handshake headers (the gateway validates them via /auth/validate).
//
// Everything is configurable through env vars so you can point it at other users
// or hosts without editing the file:
//   GATEWAY_URL=http://localhost:3000 USERNAME=alice PASSWORD=1234 node tester.mjs

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const USERNAME = process.env.USERNAME || 'testuser';
const PASSWORD = process.env.PASSWORD || '1234';

// Build a Cookie request header ("name=value; name=value") out of the raw
// Set-Cookie lines returned by login. We only need the "name=value" part of each
// line (everything before the first ';'), dropping attributes like Path/HttpOnly.
function buildCookieHeader(setCookieLines)
{
	const pairs = setCookieLines.map((line) => line.split(';')[0].trim());

	return (pairs.join('; '));
}

async function login()
{
	console.log(`[login] POST ${GATEWAY_URL}/auth/login as "${USERNAME}"`);

	const res = await fetch(`${GATEWAY_URL}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
	});

	if (!res.ok)
	{
		const text = await res.text().catch(() => '');

		throw new Error(`login failed: ${res.status} ${res.statusText} ${text}`);
	}

	// Node 18+ exposes getSetCookie() to read the multiple Set-Cookie headers.
	const setCookieLines = res.headers.getSetCookie();

	if (!setCookieLines || setCookieLines.length === 0)
		throw new Error('login succeeded but no Set-Cookie header was returned');

	const cookie = buildCookieHeader(setCookieLines);

	console.log(`[login] ok, cookies: ${cookie}`);

	return (cookie);
}

function connectSocket(cookie)
{
	console.log(`[ws] connecting to ${GATEWAY_URL}/notification`);

	// extraHeaders is honoured on both the websocket upgrade and the polling
	// handshake, which is exactly what the gateway reads to authenticate.
	const socket = io(`${GATEWAY_URL}/notification`, {
		transports: ['websocket', 'polling'],
		extraHeaders: { Cookie: cookie },
		reconnection: false,
	});

	socket.on('connect', () =>
	{
		console.log(`[ws] connected, socket id = ${socket.id}`);
		console.log('[ws] listening for events... (Ctrl+C to quit)');
	});

	socket.onAny((event, ...args) =>
	{
		console.log(`[ws] event "${event}"`, ...args);
	});

	socket.on('connect_error', (err) =>
	{
		console.error(`[ws] connect_error: ${err.message}`);
	});

	socket.on('disconnect', (reason) =>
	{
		console.log(`[ws] disconnected: ${reason}`);
	});

	return (socket);
}

async function main()
{
	try
	{
		const cookie = await login();

		connectSocket(cookie);
	}
	catch (err)
	{
		console.error(`[fatal] ${err.message}`);
		process.exit(1);
	}
}

main();
