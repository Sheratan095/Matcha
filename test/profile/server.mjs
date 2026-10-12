// Web-based tester for the PROFILE service, driven end-to-end through the API gateway.
//
// Why a tiny server instead of a pure browser page:
//   - The gateway issues HTTP-only JWT cookies (access_token / refresh_token) that browser
//     JS cannot read, and it only allows CORS from the real frontend origin. So instead of
//     fighting that, the browser talks ONLY to this server (same origin, no CORS), and this
//     server holds the cookies in a server-side jar and forwards them to the gateway — exactly
//     the credentials a real logged-in user would carry.
//
// Zero backend dependencies: Node 18+ globals (fetch / FormData / Blob) and the built-in http
// module. The page itself loads Leaflet (map) and Nominatim (reverse geocode) from public CDNs.
//
// Run:
//   node test/profile/server.mjs
//   GATEWAY_URL=http://localhost:3000 PORT=4100 node test/profile/server.mjs
//
// Then open http://localhost:4100 . Default login is the seeded testuser / 1234
// (see infra/db/seeds/001_users.sql).

import { createServer } from 'node:http';

const	GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const	PORT        = Number(process.env.PORT ?? 4100);

// Server-side cookie jar: name -> value. This is what makes the tester "logged in".
const	jar = new Map();
let		lastUserId = null;

// Merge a gateway Set-Cookie list into the jar, keeping only the name=value part.
function mergeCookies(setCookies)
{
	for (const raw of setCookies)
	{
		const	pair = raw.split(';', 1)[0];
		const	eq   = pair.indexOf('=');

		if (eq === -1)
			continue;

		const	name  = pair.slice(0, eq).trim();
		const	value = pair.slice(eq + 1).trim();

		// An empty value with an expiry in the past is how logout clears a cookie.
		if (value === '')
			jar.delete(name);
		else
			jar.set(name, value);
	}
}

function cookieHeader()
{
	return ([...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
}

// Single choke point for every call to the gateway: attaches the jar cookies, captures any
// Set-Cookie coming back, and returns the status + raw text body.
async function gateway(method, path, { headers = {}, body = undefined } = {})
{
	const	outHeaders = { ...headers };
	const	cookie     = cookieHeader();

	if (cookie)
		outHeaders['cookie'] = cookie;

	const	res = await fetch(`${GATEWAY_URL}${path}`,
	{
		method,
		headers: outHeaders,
		body,
	});

	// getSetCookie() returns every Set-Cookie header separately (Node 18.14+/20+).
	const	setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];

	if (setCookies.length > 0)
		mergeCookies(setCookies);

	const	text = await res.text();

	return ({ status: res.status, text });
}

// Reads a full request body into a Buffer (used for JSON passthrough and raw file bytes).
function readBody(req)
{
	return (new Promise((resolve, reject) =>
	{
		const	chunks = [];

		req.on('data', chunk => chunks.push(chunk));
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	}));
}

// Relays a gateway {status, text} result straight back to the browser as JSON.
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

async function handleApi(req, res, url)
{
	const	path   = url.pathname;
	const	method = req.method;

	// --- auth -----------------------------------------------------------------

	if (path === '/api/status' && method === 'GET')
	{
		return (sendJson(res, 200,
		{
			loggedIn: jar.has('access_token'),
			userId:   lastUserId,
			gateway:  GATEWAY_URL,
		}));
	}

	if (path === '/api/login' && method === 'POST')
	{
		const	body   = await readBody(req);
		const	result = await gateway('POST', '/auth/login',
		{
			headers: { 'content-type': 'application/json' },
			body:    body,
		});

		// Remember the userId so the UI can show who we are without re-parsing everywhere.
		try
		{
			lastUserId = JSON.parse(result.text)?.userId ?? lastUserId;
		}
		catch
		{
			// Non-JSON (e.g. a gateway error page) just leaves lastUserId untouched.
		}

		return (sendGateway(res, result));
	}

	if (path === '/api/logout' && method === 'POST')
	{
		const	result = await gateway('POST', '/auth/logout');

		jar.clear();
		lastUserId = null;

		return (sendGateway(res, result));
	}

	if (path === '/api/refresh' && method === 'POST')
	{
		return (sendGateway(res, await gateway('POST', '/auth/refresh')));
	}

	// --- profile --------------------------------------------------------------

	if (path === '/api/profile' && method === 'GET')
	{
		return (sendGateway(res, await gateway('GET', '/profile')));
	}

	if (path === '/api/viewers' && method === 'GET')
	{
		return (sendGateway(res, await gateway('GET', '/profile/viewers')));
	}

	if (path === '/api/interests' && method === 'GET')
	{
		return (sendGateway(res, await gateway('GET', '/profile/interests')));
	}

	if (path === '/api/profile' && method === 'PATCH')
	{
		const	body = await readBody(req);

		return (sendGateway(res, await gateway('PATCH', '/profile',
		{
			headers: { 'content-type': 'application/json' },
			body:    body,
		})));
	}

	// Set the logged-in user's location (coordinates from the interactive map).
	if (path === '/api/location' && method === 'PUT')
	{
		const	body = await readBody(req);

		return (sendGateway(res, await gateway('PUT', '/profile/location',
		{
			headers: { 'content-type': 'application/json' },
			body:    body,
		})));
	}

	// GET /api/profile/:userId
	const	byId = path.match(/^\/api\/profile\/([^/]+)$/);

	if (byId && method === 'GET')
	{
		return (sendGateway(res, await gateway('GET', `/profile/${encodeURIComponent(byId[1])}`)));
	}

	// --- pictures -------------------------------------------------------------

	if (path === '/api/pictures' && method === 'POST')
	{
		// The browser sends the raw file bytes with its name/type in headers; we rebuild a
		// proper multipart form here so the gateway/profile service sees a normal upload.
		const	bytes    = await readBody(req);
		const	filename = decodeURIComponent(req.headers['x-filename'] ?? 'upload.bin');
		const	mime     = req.headers['x-mime'] ?? 'application/octet-stream';

		const	form = new FormData();

		form.append('file', new Blob([bytes], { type: mime }), filename);

		return (sendGateway(res, await gateway('POST', '/profile/pictures', { body: form })));
	}

	// DELETE /api/pictures/:id  and  PATCH /api/pictures/:id/profile
	const	picId = path.match(/^\/api\/pictures\/([^/]+)$/);

	if (picId && method === 'DELETE')
	{
		return (sendGateway(res, await gateway('DELETE', `/profile/pictures/${encodeURIComponent(picId[1])}`)));
	}

	const	picProfile = path.match(/^\/api\/pictures\/([^/]+)\/profile$/);

	if (picProfile && method === 'PATCH')
	{
		return (sendGateway(res, await gateway('PATCH', `/profile/pictures/${encodeURIComponent(picProfile[1])}/profile`)));
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
		// A thrown error here almost always means the gateway is unreachable.
		sendJson(res, 502, { error: 'Gateway request failed', detail: String(err?.message ?? err) });
	}
});

server.listen(PORT, () =>
{
	console.log(`Profile tester UI:  http://localhost:${PORT}`);
	console.log(`Proxying to gateway: ${GATEWAY_URL}`);
	console.log(`Default login:       testuser / 1234 (seeded)`);
});

// --- the single-page UI --------------------------------------------------------

const	PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Matcha · Profile Tester</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
	integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>
	:root
	{
		--bg: #f1efe4;
		--panel: #fffdf7;
		--border: #e7e1d1;
		--text: #3b463a;
		--muted: #93998a;
		--accent: #7fae6f;
		--accent-dark: #5f9657;
		--peach: #eca98e;
		--ok: #5f9657;
		--err: #e2727f;
		--radius: 18px;
		--shadow: 0 8px 24px rgba(90, 110, 80, .10);
	}
	* { box-sizing: border-box; }
	body
	{
		margin: 0;
		background:
			radial-gradient(1200px 500px at 110% -10%, #e4efd6 0%, transparent 55%),
			radial-gradient(900px 500px at -10% 0%, #fae7dd 0%, transparent 50%),
			var(--bg);
		min-height: 100vh;
		color: var(--text);
		font: 15px/1.55 "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif;
	}
	header
	{
		padding: 18px 24px;
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	header h1 { font-size: 20px; font-weight: 800; margin: 0; letter-spacing: .3px; }
	header .leaf { font-size: 26px; filter: drop-shadow(0 2px 3px rgba(95,150,87,.3)); }
	.status
	{
		margin-left: auto;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 6px 14px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
		box-shadow: var(--shadow);
	}
	.status b { color: var(--accent-dark); }
	.layout { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding: 8px 24px 28px; }
	@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
	.panel
	{
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 18px 20px;
		box-shadow: var(--shadow);
	}
	.panel h2
	{
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 1.2px;
		color: var(--accent-dark);
		margin: 0 0 14px;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	label { display: block; color: var(--muted); margin: 10px 0 4px; font-size: 12px; font-weight: 700; }
	label.inline { display: flex; align-items: center; gap: 7px; font-weight: 600; }
	label.inline input { width: auto; }
	input, select
	{
		width: 100%;
		padding: 9px 12px;
		background: #fbfaf3;
		border: 1px solid var(--border);
		border-radius: 11px;
		color: var(--text);
		font: inherit;
		transition: border-color .15s, box-shadow .15s;
	}
	input:focus, select:focus
	{
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(127, 174, 111, .18);
	}
	.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
	.row > * { flex: 1; min-width: 120px; }
	button
	{
		padding: 9px 16px;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text);
		cursor: pointer;
		font: inherit;
		font-weight: 700;
		transition: transform .08s, border-color .15s, background .15s;
	}
	button:hover { border-color: var(--accent); transform: translateY(-1px); }
	button:active { transform: translateY(0); }
	button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	button.primary:hover { background: var(--accent-dark); border-color: var(--accent-dark); }
	button.danger { color: var(--err); }
	button.danger:hover { border-color: var(--err); }
	.btns { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
	.pics { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
	.pic
	{
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 7px;
		width: 132px;
		background: #fff;
	}
	.pic.isprofile { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(127,174,111,.18); }
	.pic img { width: 100%; height: 104px; object-fit: cover; border-radius: 10px; background: #eee; display: block; }
	.pic .id { font-size: 10px; color: var(--muted); word-break: break-all; margin: 6px 0; }
	.pic .pbtns { display: flex; gap: 5px; }
	.pic .pbtns button { flex: 1; padding: 5px; font-size: 11px; }
	.badge { font-size: 11px; color: var(--accent-dark); font-weight: 700; }

	/* location / map */
	#map
	{
		height: 280px;
		border-radius: 14px;
		border: 1px solid var(--border);
		overflow: hidden;
		margin-bottom: 10px;
		z-index: 0;
	}
	.coords
	{
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		font-size: 13px;
	}
	.coords .pill
	{
		background: #f0f5ea;
		border: 1px solid #dce7d3;
		border-radius: 999px;
		padding: 4px 12px;
		font-weight: 700;
		color: var(--accent-dark);
	}
	#place { color: var(--muted); font-weight: 600; margin-top: 8px; min-height: 18px; }

	/* interest picker */
	.chips { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 7px; }
	.chip
	{
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #f0f5ea;
		border: 1px solid #dce7d3;
		border-radius: 999px;
		padding: 4px 7px 4px 12px;
		font-size: 12px;
		font-weight: 700;
		color: var(--accent-dark);
	}
	.chip button { padding: 0 5px; border: none; background: transparent; color: var(--muted); font-size: 14px; line-height: 1; }
	.chip button:hover { color: var(--err); transform: none; }
	.combo { position: relative; }
	.dropdown
	{
		position: absolute;
		z-index: 400;
		left: 0;
		right: 0;
		margin-top: 3px;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 11px;
		max-height: 200px;
		overflow: auto;
		display: none;
		box-shadow: var(--shadow);
	}
	.dropdown.open { display: block; }
	.opt { padding: 8px 12px; cursor: pointer; display: flex; justify-content: space-between; gap: 8px; }
	.opt:hover, .opt.active { background: #f0f5ea; }
	.opt .tag { color: var(--muted); font-size: 11px; }
	.opt.create { color: var(--accent-dark); font-weight: 700; }

	#outWrap { grid-column: 1 / -1; }
	.outhead { display: flex; justify-content: space-between; align-items: center; }
	pre#out
	{
		background: #2f352c;
		color: #e9 efe3;
		color: #eaf0e3;
		border: 1px solid #272c24;
		border-radius: 12px;
		padding: 14px;
		max-height: 340px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 12px 0 0;
		font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
		font-size: 13px;
	}
	.code-ok { color: var(--ok); font-weight: 800; }
	.code-err { color: var(--err); font-weight: 800; }
	small.hint { color: var(--muted); font-weight: 600; }
</style>
</head>
<body>
<header>
	<span class="leaf">🍵</span>
	<h1>Matcha · Profile Tester</h1>
	<span class="status" id="status">checking…</span>
</header>

<div class="layout">

	<section class="panel">
		<h2>🔑 Auth</h2>
		<div class="row">
			<div>
				<label>username</label>
				<input id="username" value="testuser" />
			</div>
			<div>
				<label>password</label>
				<input id="password" value="1234" />
			</div>
		</div>
		<div class="btns">
			<button class="primary" onclick="login()">Login</button>
			<button onclick="refresh()">Refresh token</button>
			<button class="danger" onclick="logout()">Logout</button>
		</div>
		<small class="hint">Seeded users: testuser / alice (password 1234).</small>
	</section>

	<section class="panel">
		<h2>👀 Read</h2>
		<div class="btns">
			<button onclick="getMe()">GET my profile</button>
			<button onclick="getViewers()">GET viewers</button>
		</div>
		<label>Get another profile by userId</label>
		<div class="row">
			<input id="otherId" placeholder="userId (uuid)" />
			<button onclick="getById()">GET /profile/:id</button>
		</div>
	</section>

	<section class="panel">
		<h2>📍 Location</h2>
		<div id="map"></div>
		<div class="coords">
			<span class="pill">lat <span id="lat">—</span></span>
			<span class="pill">lng <span id="lng">—</span></span>
		</div>
		<div id="place">click the map or drag the pin to pick a spot</div>
		<div class="btns">
			<button onclick="useGps()">📡 Use my GPS</button>
			<button class="primary" onclick="saveLocation()">💾 Save location</button>
		</div>
		<small class="hint">Saving sends decimal coordinates to PUT /profile/location.</small>
	</section>

	<section class="panel">
		<h2>✏️ Update profile (PATCH)</h2>
		<small class="hint">Leave a field blank to omit it.</small>
		<div class="row">
			<div>
				<label>firstName</label>
				<input id="firstName" />
			</div>
			<div>
				<label>lastName</label>
				<input id="lastName" />
			</div>
		</div>
		<div class="row">
			<div>
				<label>gender</label>
				<select id="gender">
					<option value=""></option>
					<option>male</option>
					<option>female</option>
					<option>other</option>
				</select>
			</div>
			<div>
				<label>sexualPreference</label>
				<select id="sexualPreference">
					<option value=""></option>
					<option>male</option>
					<option>female</option>
					<option>both</option>
					<option>other</option>
				</select>
			</div>
		</div>
		<label>biography</label>
		<input id="biography" />

		<label>interests</label>
		<div class="chips" id="interestChips"></div>
		<div class="combo">
			<input id="interestSearch" placeholder="search interests, or type a new one + Enter" autocomplete="off" />
			<div class="dropdown" id="interestDropdown"></div>
		</div>
		<label class="inline">
			<input type="checkbox" id="interestsEnabled" />
			send interests in this PATCH (unchecked = leave them untouched; checked + empty = clear all)
		</label>

		<div class="btns">
			<button class="primary" onclick="updateProfile()">Send PATCH</button>
		</div>
	</section>

	<section class="panel">
		<h2>🖼️ Pictures</h2>
		<label>Upload a picture (jpeg / png / webp, max 5)</label>
		<div class="row">
			<input type="file" id="file" accept="image/jpeg,image/png,image/webp" />
			<button class="primary" onclick="uploadPicture()">Upload</button>
		</div>
		<div class="btns">
			<button onclick="getMe()">Reload pictures</button>
		</div>
		<div class="pics" id="pics"></div>
	</section>

	<section class="panel" id="outWrap">
		<div class="outhead">
			<h2>📨 Last response</h2>
			<span id="code"></span>
		</div>
		<pre id="out">—</pre>
	</section>

</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
	integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
	const	out    = document.getElementById('out');
	const	codeEl = document.getElementById('code');
	const	picsEl = document.getElementById('pics');

	// Central fetch wrapper: shows status + pretty body, returns the parsed payload.
	async function call(method, path, opts = {})
	{
		let	res;

		try
		{
			res = await fetch(path, { method, ...opts });
		}
		catch (err)
		{
			show(0, { error: 'request failed: ' + err.message });

			return (null);
		}

		const	text = await res.text();
		let		data;

		try
		{
			data = JSON.parse(text);
		}
		catch
		{
			data = text;
		}

		show(res.status, data);

		return (data);
	}

	function show(status, data)
	{
		const	ok = status >= 200 && status < 300;

		codeEl.textContent = 'HTTP ' + (status || '—');
		codeEl.className = ok ? 'code-ok' : 'code-err';
		out.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
	}

	async function refreshStatus()
	{
		const	s = await fetch('/api/status').then(r => r.json()).catch(() => null);

		const	el = document.getElementById('status');

		if (s && s.loggedIn)
			el.innerHTML = 'logged in as <b>' + (s.userId || '?') + '</b>';
		else
			el.textContent = 'not logged in';
	}

	async function login()
	{
		const	username = document.getElementById('username').value;
		const	password = document.getElementById('password').value;

		await call('POST', '/api/login',
		{
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ username, password }),
		});

		await refreshStatus();
	}

	async function logout()
	{
		await call('POST', '/api/logout');
		await refreshStatus();
	}

	async function refresh()
	{
		await call('POST', '/api/refresh');
		await refreshStatus();
	}

	async function getMe()
	{
		const	data = await call('GET', '/api/profile');

		renderPictures(data);
		syncInterestsFromProfile(data);
		updateLocationUI(data);
	}

	async function getViewers()
	{
		await call('GET', '/api/viewers');
	}

	async function getById()
	{
		const	id = document.getElementById('otherId').value.trim();

		if (!id)
			return (show(0, { error: 'enter a userId first' }));

		await call('GET', '/api/profile/' + encodeURIComponent(id));
	}

	// ---- location / map -----------------------------------------------------

	let	map        = null;
	let	marker     = null;
	let	pendingLat = null;   // coords staged by a click/drag/GPS, not yet saved
	let	pendingLng = null;

	function initMap()
	{
		// Default view: roughly centred on Italy until we know the user's spot.
		map = L.map('map').setView([41.9028, 12.4964], 4);

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		{
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors',
		}).addTo(map);

		map.on('click', ev => setPin(ev.latlng.lat, ev.latlng.lng));

		// The map is created before its panel has settled its size, so recompute once.
		setTimeout(() => map.invalidateSize(), 0);
	}

	// Places / moves the pin, stages the coords and shows them. Does NOT save on its own.
	function setPin(lat, lng, recenter)
	{
		pendingLat = lat;
		pendingLng = lng;

		if (!marker)
		{
			marker = L.marker([lat, lng], { draggable: true }).addTo(map);

			marker.on('dragend', () =>
			{
				const	p = marker.getLatLng();

				setPin(p.lat, p.lng, false);
			});
		}
		else
			marker.setLatLng([lat, lng]);

		if (recenter)
			map.setView([lat, lng], 13);

		document.getElementById('lat').textContent = lat.toFixed(6);
		document.getElementById('lng').textContent = lng.toFixed(6);

		reverseGeocode(lat, lng);
	}

	// Display-only: asks Nominatim for a human label. The backend stores only coordinates,
	// so this is purely a nicety and failures are silent.
	async function reverseGeocode(lat, lng)
	{
		const	el = document.getElementById('place');

		el.textContent = 'locating…';

		try
		{
			const	url = 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&lat=' + lat + '&lon=' + lng;
			const	r   = await fetch(url, { headers: { 'accept': 'application/json' } });
			const	d   = await r.json();

			el.textContent = d.display_name || '(unknown place)';
		}
		catch
		{
			el.textContent = '(label unavailable)';
		}
	}

	// Reflects the loaded profile's stored coordinates on the map (null = nothing set yet).
	function updateLocationUI(profile)
	{
		if (!profile || profile.latitude == null || profile.longitude == null)
			return;

		setPin(profile.latitude, profile.longitude, true);
	}

	function useGps()
	{
		if (!navigator.geolocation)
			return (show(0, { error: 'geolocation not supported by this browser' }));

		navigator.geolocation.getCurrentPosition(
			pos => setPin(pos.coords.latitude, pos.coords.longitude, true),
			err => show(0, { error: 'GPS: ' + err.message }),
		);
	}

	async function saveLocation()
	{
		if (pendingLat == null || pendingLng == null)
			return (show(0, { error: 'drop a pin on the map first (click it or use GPS)' }));

		await call('PUT', '/api/location',
		{
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ latitude: pendingLat, longitude: pendingLng }),
		});
	}

	// ---- interest picker ----------------------------------------------------

	let	allInterests      = [];   // [{ id, name }] fetched from the DB
	let	selectedInterests = [];   // lower-cased names currently chosen
	let	activeOptIndex    = -1;   // keyboard highlight within the dropdown

	const	searchEl   = document.getElementById('interestSearch');
	const	dropdownEl = document.getElementById('interestDropdown');
	const	chipsEl    = document.getElementById('interestChips');
	const	enabledEl  = document.getElementById('interestsEnabled');

	async function loadInterests()
	{
		const	res = await fetch('/api/interests').then(r => r.json()).catch(() => null);

		if (res && Array.isArray(res.interests))
			allInterests = res.interests;
	}

	// Reflect the loaded profile's current interests in the chips, WITHOUT enabling the
	// send checkbox — so a PATCH that doesn't touch interests leaves them as they are.
	function syncInterestsFromProfile(profile)
	{
		if (!profile || !Array.isArray(profile.interests))
			return;

		selectedInterests = profile.interests.map(i => String(i.name).toLowerCase());
		enabledEl.checked = false;
		renderChips();
	}

	function renderChips()
	{
		chipsEl.innerHTML = '';

		for (const name of selectedInterests)
		{
			const	chip = document.createElement('span');

			chip.className = 'chip';
			chip.textContent = name;

			const	x = document.createElement('button');

			x.type = 'button';
			x.textContent = '×';
			x.onclick = () => removeInterest(name);

			chip.appendChild(x);
			chipsEl.appendChild(chip);
		}
	}

	function addInterest(name)
	{
		const	clean = name.trim().toLowerCase();

		if (!clean)
			return;

		// Adding is a deliberate change, so start sending interests with the PATCH.
		enabledEl.checked = true;

		if (!selectedInterests.includes(clean))
			selectedInterests.push(clean);

		searchEl.value = '';
		renderChips();
		renderDropdown();
		searchEl.focus();
	}

	function removeInterest(name)
	{
		enabledEl.checked = true;
		selectedInterests = selectedInterests.filter(n => n !== name);
		renderChips();
		renderDropdown();
	}

	// Builds the dropdown: existing matches first, and ALWAYS the typed text as the last
	// "create" option, so the user can add an interest that isn't in the DB yet.
	function renderDropdown()
	{
		const	query = searchEl.value.trim().toLowerCase();
		const	opts  = [];

		// Existing tags that match the query and aren't already chosen.
		for (const tag of allInterests)
		{
			const	name = String(tag.name).toLowerCase();

			if (selectedInterests.includes(name))
				continue;

			if (query === '' || name.includes(query))
				opts.push({ name, create: false });
		}

		// The last option is whatever the user is typing — unless it is empty, already
		// selected, or an exact duplicate of a match already listed above.
		const	exactExists = opts.some(o => o.name === query);

		if (query !== '' && !selectedInterests.includes(query) && !exactExists)
			opts.push({ name: query, create: true });

		activeOptIndex = -1;
		dropdownEl.innerHTML = '';

		if (opts.length === 0)
		{
			dropdownEl.classList.remove('open');

			return;
		}

		opts.forEach((opt, i) =>
		{
			const	row = document.createElement('div');

			row.className = 'opt' + (opt.create ? ' create' : '');
			row.dataset.index = String(i);
			row.dataset.name = opt.name;

			if (opt.create)
				row.innerHTML = '<span>+ add "' + opt.name + '"</span><span class="tag">new</span>';
			else
				row.innerHTML = '<span>' + opt.name + '</span><span class="tag">existing</span>';

			// mousedown (not click) so it fires before the input's blur hides the dropdown.
			row.addEventListener('mousedown', ev =>
			{
				ev.preventDefault();
				addInterest(opt.name);
			});

			dropdownEl.appendChild(row);
		});

		dropdownEl.classList.add('open');
	}

	function moveActive(delta)
	{
		const	rows = dropdownEl.querySelectorAll('.opt');

		if (rows.length === 0)
			return;

		activeOptIndex = (activeOptIndex + delta + rows.length) % rows.length;

		rows.forEach((r, i) => r.classList.toggle('active', i === activeOptIndex));
	}

	searchEl.addEventListener('input', renderDropdown);
	searchEl.addEventListener('focus', renderDropdown);

	searchEl.addEventListener('blur', () =>
	{
		// Delay so a mousedown on an option still registers before we hide.
		setTimeout(() => dropdownEl.classList.remove('open'), 120);
	});

	searchEl.addEventListener('keydown', ev =>
	{
		if (ev.key === 'ArrowDown')
		{
			ev.preventDefault();
			moveActive(1);
		}
		else if (ev.key === 'ArrowUp')
		{
			ev.preventDefault();
			moveActive(-1);
		}
		else if (ev.key === 'Enter')
		{
			ev.preventDefault();

			const	rows = dropdownEl.querySelectorAll('.opt');

			// Enter picks the highlighted row, else just adds whatever is typed.
			if (activeOptIndex >= 0 && rows[activeOptIndex])
				addInterest(rows[activeOptIndex].dataset.name);
			else
				addInterest(searchEl.value);
		}
		else if (ev.key === 'Escape')
		{
			dropdownEl.classList.remove('open');
		}
	});

	// ---- update / pictures ---------------------------------------------------

	async function updateProfile()
	{
		const	body = {};

		const	firstName        = document.getElementById('firstName').value.trim();
		const	lastName         = document.getElementById('lastName').value.trim();
		const	gender           = document.getElementById('gender').value;
		const	sexualPreference = document.getElementById('sexualPreference').value;
		const	biography        = document.getElementById('biography').value.trim();

		if (firstName)        body.firstName = firstName;
		if (lastName)         body.lastName = lastName;
		if (gender)           body.gender = gender;
		if (sexualPreference) body.sexualPreference = sexualPreference;
		if (biography)        body.biography = biography;

		// Only send interests when the user opted in; then it is a full replacement list.
		if (enabledEl.checked)
			body.interests = selectedInterests;

		const	data = await call('PATCH', '/api/profile',
		{
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});

		renderPictures(data);
		syncInterestsFromProfile(data);
		updateLocationUI(data);
		loadInterests(); // a newly created interest is now in the DB, refresh the suggestions
	}

	async function uploadPicture()
	{
		const	input = document.getElementById('file');
		const	file  = input.files[0];

		if (!file)
			return (show(0, { error: 'pick a file first' }));

		// Send the raw bytes with name/type in headers; the server rebuilds the multipart form.
		const	buf  = await file.arrayBuffer();
		const	data = await call('POST', '/api/pictures',
		{
			headers:
			{
				'content-type': 'application/octet-stream',
				'x-filename': encodeURIComponent(file.name),
				'x-mime': file.type || 'application/octet-stream',
			},
			body: buf,
		});

		input.value = '';
		renderPicturesFromList(data);
	}

	async function deletePicture(id)
	{
		const	data = await call('DELETE', '/api/pictures/' + encodeURIComponent(id));

		renderPicturesFromList(data);
	}

	async function setProfilePicture(id)
	{
		const	data = await call('PATCH', '/api/pictures/' + encodeURIComponent(id) + '/profile');

		renderPicturesFromList(data);
	}

	// getMe / updateProfile return a full profile ({ pictures: [...] }).
	function renderPictures(profile)
	{
		if (profile && Array.isArray(profile.pictures))
			drawPics(profile.pictures);
	}

	// The picture endpoints return { pictures: [...] } directly.
	function renderPicturesFromList(data)
	{
		if (data && Array.isArray(data.pictures))
			drawPics(data.pictures);
	}

	function drawPics(pictures)
	{
		picsEl.innerHTML = '';

		for (const p of pictures)
		{
			const	card = document.createElement('div');

			card.className = 'pic' + (p.isProfile ? ' isprofile' : '');
			card.innerHTML =
				'<img src="' + p.url + '" alt="" onerror="this.style.opacity=.25" />' +
				(p.isProfile ? '<div class="badge">★ profile</div>' : '') +
				'<div class="id">' + p.id + '</div>' +
				'<div class="pbtns">' +
					'<button onclick="setProfilePicture(\\'' + p.id + '\\')">set</button>' +
					'<button class="danger" onclick="deletePicture(\\'' + p.id + '\\')">del</button>' +
				'</div>';

			picsEl.appendChild(card);
		}
	}

	// Auto-login as the seeded tester on load, then load interests + profile + map.
	(async function init()
	{
		initMap();
		await refreshStatus();
		await login();
		await loadInterests();
		await getMe();
	})();
</script>
</body>
</html>`;
