import { createServer } from 'node:http';
import { io } from 'socket.io-client';

// Browser chat tester for ONE user. Run it twice (different PORT + TEST_USER) and open both pages
// to chat live between two users.
//
// Why a server per user: the gateway's auth cookie is httpOnly on the gateway origin, so the
// browser can't open the authenticated /notification socket itself. This server holds the cookie
// jar, opens the socket.io connection on the browser's behalf, and relays inbound events to the
// page over Server-Sent Events. The page sends via plain HTTP to this server, which forwards to
// the gateway with the jar cookies.
//
// Run:
//   PORT=4300 TEST_USER=testuser node ui-server.mjs
//   PORT=4301 TEST_USER=alice    node ui-server.mjs
// then open http://localhost:4300 and http://localhost:4301 (users must be matched to chat).

const	GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const	PORT        = Number(process.env.PORT ?? 4300);
const	USERNAME    = process.env.TEST_USER ?? 'testuser';
const	PASSWORD    = process.env.TEST_PASS ?? '1234';

const	jar = new Map();         // server-side cookie jar (name -> value)
let		myUserId = null;         // resolved after login
const	sseClients = new Set();  // open SSE responses to fan events out to

function mergeCookies(setCookies)
{
	for (const raw of setCookies)
	{
		const	pair = raw.split(';', 1)[0];
		const	eq   = pair.indexOf('=');

		if (eq === -1)
			continue;

		jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
	}
}

function cookieHeader()
{
	return ([...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
}

// Single choke point for gateway calls: attaches the jar cookies, captures Set-Cookie.
async function gateway(method, path, { headers = {}, body } = {})
{
	const	outHeaders = { ...headers };
	const	cookie     = cookieHeader();

	if (cookie)
		outHeaders.cookie = cookie;

	const	res = await fetch(`${GATEWAY_URL}${path}`, { method, headers: outHeaders, body });
	const	setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];

	if (setCookies.length > 0)
		mergeCookies(setCookies);

	return ({ status: res.status, text: await res.text() });
}

function readBody(req)
{
	return (new Promise((resolve, reject) =>
	{
		const	chunks = [];

		req.on('data', c => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	}));
}

function sendGateway(res, result)
{
	res.writeHead(result.status, { 'content-type': 'application/json' });
	res.end(result.text || '{}');
}

function sendJson(res, status, obj)
{
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(JSON.stringify(obj));
}

// Push one event to every open SSE connection.
function broadcast(event, payload)
{
	const	line = `data: ${JSON.stringify({ event, payload })}\n\n`;

	for (const client of sseClients)
		client.write(line);
}

async function login()
{
	const	result = await gateway('POST', '/auth/login',
	{
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
	});

	if (result.status < 200 || result.status >= 300)
		throw new Error(`login ${USERNAME} failed: ${result.status} ${result.text}`);

	const	me = await gateway('GET', '/profile');

	try
	{
		myUserId = JSON.parse(me.text)?.userId ?? null;
	}
	catch
	{
		myUserId = null;
	}

	console.log(`Logged in as ${USERNAME} (${myUserId})`);
}

// Opens the authenticated notification socket and relays every inbound event to the browsers.
function connectSocket()
{
	const	socket = io(`${GATEWAY_URL}/notification`,
	{
		transports: ['websocket', 'polling'],
		extraHeaders: { Cookie: cookieHeader() },
		reconnection: true,
	});

	socket.on('connect', () => console.log(`[ws] connected (${socket.id})`));
	socket.on('connect_error', err => console.warn(`[ws] connect_error: ${err.message}`));
	socket.onAny((event, payload) =>
	{
		console.log(`[ws] ${event} ${JSON.stringify(payload)}`);
		broadcast(event, payload);
	});
}

async function handleApi(req, res, url)
{
	const	path   = url.pathname;
	const	method = req.method;

	if (path === '/api/status' && method === 'GET')
		return (sendJson(res, 200, { username: USERNAME, userId: myUserId, gateway: GATEWAY_URL }));

	// Matches (everyone you can chat with, even with no messages yet).
	if (path === '/api/matches' && method === 'GET')
		return (sendGateway(res, await gateway('GET', '/profile/matches')));

	// Conversations that have messages (carry chatId + last-message preview).
	if (path === '/api/chats' && method === 'GET')
		return (sendGateway(res, await gateway('GET', '/chat')));

	// History of one chat (marks the other side's messages read as a side effect).
	const	hist = path.match(/^\/api\/chat\/([^/]+)$/);

	if (hist && method === 'GET')
		return (sendGateway(res, await gateway('GET', `/chat/${encodeURIComponent(hist[1])}`)));

	// Send a message.
	if (path === '/api/message' && method === 'POST')
	{
		const	body = await readBody(req);

		return (sendGateway(res, await gateway('POST', '/chat/message',
		{
			headers: { 'content-type': 'application/json' },
			body,
		})));
	}

	// Server-Sent Events: live relay of the notification socket.
	if (path === '/api/events' && method === 'GET')
	{
		res.writeHead(200,
		{
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive',
		});
		res.write('retry: 2000\n\n');
		sseClients.add(res);
		req.on('close', () => sseClients.delete(res));

		return;
	}

	return (sendJson(res, 404, { error: `No such API route: ${method} ${path}` }));
}

const	server = createServer(async (req, res) =>
{
	const	url = new URL(req.url, `http://localhost:${PORT}`);

	try
	{
		if (url.pathname === '/' || url.pathname === '/index.html')
		{
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			res.end(PAGE);

			return;
		}

		if (url.pathname.startsWith('/api/'))
		{
			await handleApi(req, res, url);

			return;
		}

		sendJson(res, 404, { error: 'Not found' });
	}
	catch (err)
	{
		sendJson(res, 502, { error: 'Gateway request failed', detail: String(err?.message ?? err) });
	}
});

(async function start()
{
	await login();
	connectSocket();

	server.listen(PORT, () =>
	{
		console.log(`Chat tester UI:     http://localhost:${PORT}  (as ${USERNAME})`);
		console.log(`Proxying to gateway: ${GATEWAY_URL}`);
	});
})().catch(err =>
{
	console.error('startup failed:', err.message);
	process.exit(1);
});

// --- the single-page UI --------------------------------------------------------

const	PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Matcha · Chat</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
	:root
	{
		--bg: #f1efe4; --panel: #fffdf7; --border: #e7e1d1; --text: #3b463a; --muted: #93998a;
		--accent: #7fae6f; --accent-dark: #5f9657; --mine: #dff0d4; --theirs: #fff; --err: #e2727f;
		--radius: 16px; --shadow: 0 8px 24px rgba(90,110,80,.10);
	}
	* { box-sizing: border-box; }
	html, body { height: 100%; }
	body
	{
		margin: 0; height: 100vh; display: flex; flex-direction: column; color: var(--text);
		background: radial-gradient(1000px 440px at 110% -10%, #e4efd6 0, transparent 55%), var(--bg);
		font: 15px/1.5 "Nunito", system-ui, sans-serif;
	}
	header { padding: 14px 22px; display: flex; align-items: center; gap: 12px; flex: 0 0 auto; }
	header h1 { font-size: 18px; font-weight: 800; margin: 0; }
	header .me { margin-left: auto; background: var(--panel); border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px; font-weight: 700; font-size: 13px; }
	header .me b { color: var(--accent-dark); }
	.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--err); display: inline-block; margin-right: 6px; vertical-align: middle; }
	.dot.on { background: var(--accent); }
	.layout { flex: 1 1 auto; display: grid; grid-template-columns: 300px 1fr; gap: 16px; padding: 0 22px 20px; min-height: 0; }
	@media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
	.side, .main { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); min-height: 0; display: flex; flex-direction: column; }
	.side h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--accent-dark); margin: 0; padding: 14px 16px 8px; }
	#matches { overflow: auto; padding: 4px 8px 8px; display: flex; flex-direction: column; gap: 4px; }
	.match { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 12px; cursor: pointer; }
	.match:hover { background: #f0f5ea; }
	.match.active { background: #e7f0de; }
	.match img, .match .ph { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #eef3e8; display: flex; align-items: center; justify-content: center; font-size: 18px; flex: 0 0 auto; }
	.match .meta { min-width: 0; }
	.match .meta b { display: block; }
	.match .meta .pv { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.main .thead { padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 800; }
	#thread { flex: 1 1 auto; overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
	.empty { color: var(--muted); font-weight: 600; margin: auto; }
	.bubble { max-width: 72%; padding: 8px 12px; border-radius: 14px; border: 1px solid var(--border); background: var(--theirs); }
	.bubble.mine { align-self: flex-end; background: var(--mine); border-color: #cfe4c0; }
	.bubble .tick { font-size: 11px; color: var(--muted); margin-top: 3px; text-align: right; }
	.bubble .tick.read { color: var(--accent-dark); font-weight: 700; }
	.composer { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--border); }
	.composer input { flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 999px; font: inherit; background: #fbfaf3; }
	.composer input:focus { outline: none; border-color: var(--accent); }
	.composer button { padding: 10px 18px; border: none; border-radius: 999px; background: var(--accent); color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
	.composer button:hover { background: var(--accent-dark); }
	.composer button:disabled { opacity: .5; cursor: default; }
</style>
</head>
<body>
<header>
	<span style="font-size:24px">🍵</span>
	<h1>Matcha · Chat</h1>
	<span class="me" id="me"><span class="dot" id="dot"></span>…</span>
</header>
<div class="layout">
	<section class="side">
		<h2>Matches</h2>
		<div id="matches"></div>
	</section>
	<section class="main">
		<div class="thead" id="thead">Pick a match to start chatting</div>
		<div id="thread"><div class="empty">No conversation open</div></div>
		<div class="composer">
			<input id="input" placeholder="Type a message…" maxlength="1000" disabled />
			<button id="send" onclick="send()" disabled>Send</button>
		</div>
	</section>
</div>
<script>
	var myId = null;
	var matches = [];                 // [{ userId, username, profilePictureUrl }]
	var chatByUser = {};              // userId -> { chatId, lastMessage, timestamp, lastSenderId }
	var activeUser = null;            // userId of the open conversation
	var activeChat = null;            // chatId of the open conversation (null = no messages yet)
	var thread = [];                  // messages of the open conversation; the WS 'message' event
	                                  // appends to this directly — we do NOT re-fetch history per event

	function esc(s) { return (String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); })); }

	async function getJson(path, opts) { try { var r = await fetch(path, opts); return (await r.json()); } catch (e) { return (null); } }

	async function init()
	{
		var s = await getJson('/api/status');

		myId = s && s.userId;
		document.getElementById('me').innerHTML = '<span class="dot" id="dot"></span> you are <b>' + esc(s && s.username) + '</b>';

		await reload();
		openEvents();
	}

	async function reload()
	{
		var m = await getJson('/api/matches');
		var c = await getJson('/api/chats');

		matches = (m && m.matches) || [];
		chatByUser = {};
		((c && c.chats) || []).forEach(function (chat) { chatByUser[chat.userId] = chat; });
		renderMatches();
	}

	function renderMatches()
	{
		var el = document.getElementById('matches');

		el.innerHTML = '';
		if (matches.length === 0)
			el.innerHTML = '<div class="empty" style="padding:14px">No matches yet — like someone who likes you back.</div>';

		matches.forEach(function (u)
		{
			var chat = chatByUser[u.userId];
			var pic = u.profilePictureUrl ? '<img src="' + esc(u.profilePictureUrl) + '" onerror="this.replaceWith(Object.assign(document.createElement(\\'div\\'),{className:\\'ph\\',textContent:\\'🙂\\'}))"/>' : '<div class="ph">🙂</div>';
			var preview = chat ? esc(chat.lastMessage) : 'say hi 👋';
			var row = document.createElement('div');

			row.className = 'match' + (u.userId === activeUser ? ' active' : '');
			row.innerHTML = pic + '<div class="meta"><b>' + esc(u.username) + '</b><div class="pv">' + preview + '</div></div>';
			row.onclick = function () { openConversation(u.userId, u.username); };
			el.appendChild(row);
		});
	}

	async function openConversation(userId, username)
	{
		activeUser = userId;
		activeChat = chatByUser[userId] ? chatByUser[userId].chatId : null;
		document.getElementById('thead').textContent = username;
		document.getElementById('input').disabled = false;
		document.getElementById('send').disabled = false;
		renderMatches();

		if (activeChat)
		{
			// One fetch when the conversation is opened: loads history AND marks it read server-side.
			var h = await getJson('/api/chat/' + encodeURIComponent(activeChat));

			thread = (h && h.messages) || [];
			renderThread();
			reload(); // refresh sidebar previews / cleared unread (chat list does not mark read)
		}
		else
		{
			thread = [];
			renderThread();
		}
	}

	function tickFor(status)
	{
		if (status === 'read') return ('<div class="tick read">✓✓ read</div>');
		if (status === 'delivered') return ('<div class="tick">✓✓ delivered</div>');
		return ('<div class="tick">✓ sent</div>');
	}

	function renderThread()
	{
		var el = document.getElementById('thread');

		el.innerHTML = '';
		if (thread.length === 0)
			el.innerHTML = '<div class="empty">No messages yet — send the first one.</div>';

		thread.forEach(function (m)
		{
			var mine = m.userId === myId;
			var b = document.createElement('div');

			b.className = 'bubble' + (mine ? ' mine' : '');
			b.innerHTML = esc(m.content) + (mine ? tickFor(m.status) : '');
			el.appendChild(b);
		});
		el.scrollTop = el.scrollHeight;
	}

	async function send()
	{
		var input = document.getElementById('input');
		var text = input.value.trim();

		if (!text || !activeUser)
			return;

		input.value = '';

		// Optimistic: show it immediately as 'sent'. (The WS 'message' event goes to the recipient,
		// not back to us, so we never get a duplicate.)
		thread.push({ userId: myId, content: text, status: 'sent' });
		renderThread();

		await fetch('/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toUserId: activeUser, content: text }) });

		// The first message mints the chatId; reload the sidebar to pick it up.
		await reload();
		if (!activeChat && chatByUser[activeUser])
			activeChat = chatByUser[activeUser].chatId;

		// One fetch after sending to reflect the real stored statuses (e.g. 'delivered').
		if (activeChat)
		{
			var h = await getJson('/api/chat/' + encodeURIComponent(activeChat));

			thread = (h && h.messages) || thread;
			renderThread();
		}
	}

	document.getElementById('input').addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });

	function openEvents()
	{
		var es = new EventSource('/api/events');

		es.onopen = function () { document.getElementById('dot').classList.add('on'); };
		es.onerror = function () { document.getElementById('dot').classList.remove('on'); };
		es.onmessage = function (ev)
		{
			var data; try { data = JSON.parse(ev.data); } catch (e) { return; }
			handleEvent(data.event, data.payload);
		};
	}

	async function handleEvent(event, payload)
	{
		if (event === 'message')
		{
			// payload.userId is the SENDER. Append the message straight from the event payload —
			// no history re-fetch.
			if (payload.userId === activeUser && activeChat)
			{
				thread.push(payload);
				renderThread();

				// Persist "read" for the message we just received, without re-rendering from the
				// response. This is the ONLY history call on an incoming message, and it emits a
				// single chat-seen that the sender handles locally (no ping-pong).
				fetch('/api/chat/' + encodeURIComponent(activeChat));
			}
			else if (payload.userId === activeUser && !activeChat)
			{
				// First message of a brand-new conversation: learn the chatId, then open it.
				await reload();
				if (chatByUser[activeUser])
					openConversation(activeUser, document.getElementById('thead').textContent);
			}

			await reload(); // refresh sidebar previews (chat list does not mark read -> loop-safe)
		}
		else if (event === 'chat-seen')
		{
			// The other side read our messages: flip our own bubbles to 'read' LOCALLY. No fetch,
			// so this never triggers another getChatHistory (which is what caused the loop).
			if (payload.chatId === activeChat && payload.userId !== myId)
			{
				thread.forEach(function (m) { if (m.userId === myId) m.status = 'read'; });
				renderThread();
			}
		}
		else if (event === 'match' || event === 'profile-like' || event === 'unmatch')
		{
			await reload();
		}
	}

	init();
</script>
</body>
</html>`;
