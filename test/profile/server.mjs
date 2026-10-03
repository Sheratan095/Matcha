// Web-based tester for the PROFILE service, driven end-to-end through the API gateway.
//
// Why a tiny server instead of a pure browser page:
//   - The gateway issues HTTP-only JWT cookies (access_token / refresh_token) that browser
//     JS cannot read, and it only allows CORS from the real frontend origin. So instead of
//     fighting that, the browser talks ONLY to this server (same origin, no CORS), and this
//     server holds the cookies in a server-side jar and forwards them to the gateway — exactly
//     the credentials a real logged-in user would carry.
//
// Zero dependencies: Node 18+ globals (fetch / FormData / Blob) and the built-in http module.
//
// Run:
//   node docs/test/profile/server.mjs
//   GATEWAY_URL=http://localhost:3000 PORT=4100 node docs/test/profile/server.mjs
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
<title>Profile Tester</title>
<style>
	:root
	{
		--bg: #0f1115;
		--panel: #171a21;
		--border: #262b36;
		--text: #e5e9f0;
		--muted: #8b93a7;
		--accent: #7aa2f7;
		--ok: #9ece6a;
		--err: #f7768e;
	}
	* { box-sizing: border-box; }
	body
	{
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font: 14px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
	}
	header
	{
		padding: 14px 20px;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	header h1 { font-size: 15px; margin: 0; letter-spacing: .5px; }
	.status { color: var(--muted); }
	.status b { color: var(--ok); }
	.layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
	@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
	.panel
	{
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 14px 16px;
	}
	.panel h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin: 0 0 12px; }
	label { display: block; color: var(--muted); margin: 8px 0 3px; font-size: 12px; }
	label.inline { display: flex; align-items: center; gap: 6px; }
	label.inline input { width: auto; }
	input, select
	{
		width: 100%;
		padding: 7px 9px;
		background: #0c0e13;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text);
		font: inherit;
	}
	.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
	.row > * { flex: 1; min-width: 120px; }
	button
	{
		padding: 7px 12px;
		background: #222838;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text);
		cursor: pointer;
		font: inherit;
	}
	button:hover { border-color: var(--accent); }
	button.primary { background: var(--accent); color: #0b0d12; border-color: var(--accent); font-weight: 600; }
	button.danger { color: var(--err); }
	.btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
	.pics { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
	.pic
	{
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px;
		width: 128px;
	}
	.pic.isprofile { border-color: var(--ok); }
	.pic img { width: 100%; height: 100px; object-fit: cover; border-radius: 5px; background: #000; display: block; }
	.pic .id { font-size: 10px; color: var(--muted); word-break: break-all; margin: 5px 0; }
	.pic .pbtns { display: flex; gap: 4px; }
	.pic .pbtns button { flex: 1; padding: 4px; font-size: 11px; }
	.badge { font-size: 10px; color: var(--ok); }

	/* interest picker */
	.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
	.chip
	{
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #222838;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 3px 6px 3px 10px;
		font-size: 12px;
	}
	.chip button { padding: 0 5px; border: none; background: transparent; color: var(--muted); font-size: 13px; line-height: 1; }
	.chip button:hover { color: var(--err); }
	.combo { position: relative; }
	.dropdown
	{
		position: absolute;
		z-index: 10;
		left: 0;
		right: 0;
		margin-top: 2px;
		background: #0c0e13;
		border: 1px solid var(--border);
		border-radius: 6px;
		max-height: 200px;
		overflow: auto;
		display: none;
	}
	.dropdown.open { display: block; }
	.opt { padding: 7px 10px; cursor: pointer; display: flex; justify-content: space-between; gap: 8px; }
	.opt:hover, .opt.active { background: #222838; }
	.opt .tag { color: var(--muted); font-size: 11px; }
	.opt.create { color: var(--accent); }

	#outWrap { grid-column: 1 / -1; }
	.outhead { display: flex; justify-content: space-between; align-items: center; }
	pre#out
	{
		background: #0c0e13;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 12px;
		max-height: 340px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 10px 0 0;
	}
	.code-ok { color: var(--ok); }
	.code-err { color: var(--err); }
	small.hint { color: var(--muted); }
</style>
</head>
<body>
<header>
	<h1>PROFILE TESTER</h1>
	<span class="status" id="status">checking…</span>
</header>

<div class="layout">

	<section class="panel">
		<h2>Auth</h2>
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
		<h2>Read</h2>
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
		<h2>Update profile (PATCH)</h2>
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
		<h2>Pictures</h2>
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
			<h2>Last response</h2>
			<span id="code"></span>
		</div>
		<pre id="out">—</pre>
	</section>

</div>

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
			el.innerHTML = 'logged in as <b>' + (s.userId || '?') + '</b> · gateway ' + s.gateway;
		else
			el.textContent = 'not logged in · gateway ' + (s ? s.gateway : '?');
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

	// Auto-login as the seeded tester on load, then load interests + profile.
	(async function init()
	{
		await refreshStatus();
		await login();
		await loadInterests();
		await getMe();
	})();
</script>
</body>
</html>`;
