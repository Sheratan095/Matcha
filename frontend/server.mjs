#!/usr/bin/env node
/**
 * Production server for the built app (`npm run build` writes dist/). No dependencies: Node's own http.
 *
 * - Serves dist/: hashed files under /assets/ are cached for a year, everything else is revalidated, and
 *   every other path gets index.html (the router's routes). A missing file that looks like a file (it has
 *   an extension, or sits under /assets/) is a 404, not index.html: a stale tab asking for a chunk of an
 *   older build must fail loudly, not receive HTML as JavaScript.
 * - Forwards /api/* to the gateway, HTTP and the socket.io websocket upgrade, exactly like the Vite dev
 *   proxy (vite.config.ts): the prefix is stripped, the Host header is the gateway's, and cookie paths are
 *   rewritten to `/`. The browser only ever talks to this origin, so cookies and CORS behave as in dev.
 * - Forwards GET/HEAD /pictures/* to Garage's public web endpoint (the backend's S3_PUBLIC_URL is /pictures),
 *   so profile pictures load from whatever host name or device the app is opened on. No cookies are sent.
 *
 * Settings come from the environment, then from frontend/.env (the environment wins):
 *   PORT          where to listen (default 4000: the gateway's CORS rule, the GitHub OAuth redirect and
 *                 the links in emails all point to http://localhost:4000)
 *   HOST          interface to bind (default: all of them)
 *   BACKEND_URL   the gateway (default http://localhost:3000)
 *   VITE_API_URL  the prefix the build was made with (default /api); an absolute URL means the build calls
 *                 the gateway directly and nothing is proxied
 *   PICTURES_URL  Garage's web endpoint for the pictures bucket (default
 *                 http://profile-pictures.web.garage.localhost:3902). Garage picks the bucket from the Host
 *                 header, so that host name is sent as it is, while a *.localhost name is connected to on
 *                 127.0.0.1, like browsers do (Node's resolver does not always know them)
 */
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import zlib from 'node:zlib'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const INDEX = path.join(DIST, 'index.html')

try {
  process.loadEnvFile(path.join(ROOT, '.env'))
} catch {
  // no .env: the defaults below apply
}

const PORT = Number.parseInt(process.env.PORT ?? '', 10) || 4000
const HOST = process.env.HOST || undefined
const BACKEND = parseUpstream('BACKEND_URL', process.env.BACKEND_URL || 'http://localhost:3000')
const BACKEND_PATH = BACKEND.pathname.replace(/\/+$/, '')
const API_PREFIX = apiPrefix(process.env.VITE_API_URL ?? '/api')
const client = BACKEND.protocol === 'https:' ? https : http

const PICTURES = parseUpstream('PICTURES_URL', process.env.PICTURES_URL || 'http://profile-pictures.web.garage.localhost:3902')
const PICTURES_PATH = PICTURES.pathname.replace(/\/+$/, '')
const PICTURES_PREFIX = '/pictures'
const picturesClient = PICTURES.protocol === 'https:' ? https : http

function parseUpstream(name, value) {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url
  } catch {
    // reported below
  }
  console.error(`${name} must be an http(s) URL, got "${value}"`)
  process.exit(1)
}

/** Where to connect for a URL: browsers resolve localhost and *.localhost to loopback, Node not always. */
function connectHost(url) {
  return url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ? '127.0.0.1' : url.hostname
}

/** '/api' -> '/api'; an absolute URL -> null (the build talks to the gateway itself). */
function apiPrefix(value) {
  if (!value.startsWith('/')) return null
  const prefix = value.replace(/\/+$/, '')
  return prefix || null
}

// ---------------------------------------------------------------- static files

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.webmanifest', '.txt', '.svg'])
const IMMUTABLE = 'public, max-age=31536000, immutable'
const REVALIDATE = 'no-cache'

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

const brotli = promisify(zlib.brotliCompress)
const gzip = promisify(zlib.gzip)
/** Compressed copies of dist's text files, per path and encoding, with the mtime they were made from. */
const compressed = new Map()

function pickEncoding(header) {
  const accepted = String(header ?? '')
  if (/\bbr\b/.test(accepted)) return 'br'
  if (/\bgzip\b/.test(accepted)) return 'gzip'
  return null
}

async function compressedBody(file, info, encoding) {
  const key = `${file}\0${encoding}`
  const cached = compressed.get(key)
  if (cached && cached.mtimeMs === info.mtimeMs) return cached.body
  const raw = await readFile(file)
  const body =
    encoding === 'br'
      ? await brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
      : await gzip(raw, { level: 9 })
  // a rebuild replaces the copy instead of adding one
  compressed.set(key, { mtimeMs: info.mtimeMs, body })
  return body
}

/** The file under dist/ a URL path names, or null when it would leave dist/. */
function staticPath(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const file = path.join(DIST, decoded)
  return file === DIST || file.startsWith(DIST + path.sep) ? file : null
}

async function fileInfo(file) {
  try {
    const info = await stat(file)
    return info.isFile() ? info : null
  } catch {
    return null
  }
}

async function sendFile(req, res, file, info, cacheControl) {
  const extension = path.extname(file).toLowerCase()
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[extension] ?? 'application/octet-stream',
    'Cache-Control': cacheControl,
    ETag: etag,
    'Last-Modified': info.mtime.toUTCString(),
  }
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }
  const encoding = COMPRESSIBLE.has(extension) && info.size > 1024 ? pickEncoding(req.headers['accept-encoding']) : null
  if (encoding) {
    const body = await compressedBody(file, info, encoding)
    res.writeHead(200, { ...headers, 'Content-Encoding': encoding, 'Content-Length': body.length, Vary: 'Accept-Encoding' })
    res.end(req.method === 'HEAD' ? undefined : body)
    return
  }
  res.writeHead(200, { ...headers, 'Content-Length': info.size })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res)
}

function plain(res, status, text, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...extra })
  res.end(text)
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    plain(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' })
    return
  }
  const file = staticPath(pathname)
  const info = file ? await fileInfo(file) : null
  if (file && info) {
    await sendFile(req, res, file, info, pathname.startsWith('/assets/') ? IMMUTABLE : REVALIDATE)
    return
  }
  if (pathname.startsWith('/assets/') || path.extname(pathname) !== '') {
    plain(res, 404, 'Not Found')
    return
  }
  const index = await fileInfo(INDEX)
  if (!index) {
    plain(res, 503, 'The app is not built: run `npm run build`.')
    return
  }
  await sendFile(req, res, INDEX, index, REVALIDATE)
}

// ---------------------------------------------------------------- the /api proxy

// Hop-by-hop headers belong to one connection and are never forwarded (RFC 9110 §7.6.1).
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * Path and query of a request target. Parsed after a fixed origin, so '//host/x' stays a path (a base URL
 * would read it as a host) and dot segments are resolved before routing. null when it does not parse.
 */
function requestTarget(url) {
  try {
    const parsed = new URL(`http://localhost${url ?? '/'}`)
    return { pathname: parsed.pathname, search: parsed.search }
  } catch {
    return null
  }
}

function isApi(pathname) {
  return API_PREFIX !== null && (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`))
}

/** '/api/auth/login' + '?x=1' -> '<gateway path>/auth/login?x=1'. */
function upstreamPath({ pathname, search }) {
  const rest = pathname.slice(API_PREFIX.length)
  return `${BACKEND_PATH}${rest.startsWith('/') ? rest : `/${rest}`}${search}`
}

/** Headers for the gateway: the client's, minus hop-by-hop ones, with the gateway as Host. */
function upstreamHeaders(req, { upgrade = false } = {}) {
  const listed = new Set(
    String(req.headers.connection ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  )
  const headers = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name === 'host') continue
    if (HOP_BY_HOP.has(name) || listed.has(name)) continue
    headers[name] = value
  }
  headers.host = BACKEND.host
  const remote = req.socket.remoteAddress
  if (remote) headers['x-forwarded-for'] = req.headers['x-forwarded-for'] ? `${req.headers['x-forwarded-for']}, ${remote}` : remote
  headers['x-forwarded-proto'] = req.socket.encrypted ? 'https' : 'http'
  if (req.headers.host) headers['x-forwarded-host'] = req.headers.host
  if (upgrade) {
    headers.connection = 'Upgrade'
    headers.upgrade = req.headers.upgrade
  }
  return headers
}

/** `Path=/auth` -> `Path=/`, like `cookiePathRewrite: { '*': '/' }` in vite.config.ts. */
function rewriteCookie(cookie) {
  return cookie.replace(/;\s*path=[^;]*/gi, '; Path=/')
}

/** The gateway's response headers for the browser, as a flat [name, value, ...] list (repeats kept). */
function downstreamHeaders(rawHeaders) {
  const listed = new Set()
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'connection') {
      for (const name of rawHeaders[i + 1].split(',')) listed.add(name.trim().toLowerCase())
    }
  }
  const out = []
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i]
    const lower = name.toLowerCase()
    if (HOP_BY_HOP.has(lower) || listed.has(lower)) continue
    out.push(name, lower === 'set-cookie' ? rewriteCookie(rawHeaders[i + 1]) : rawHeaders[i + 1])
  }
  return out
}

/** Same body shape as the gateway's own errors, so the app's toApiError reads it like any other. */
function badGateway(res) {
  if (res.headersSent) {
    res.destroy()
    return
  }
  const body = JSON.stringify({ statusCode: 502, message: 'The server could not be reached.', error: 'Bad Gateway' })
  res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function proxyRequest(req, res, target) {
  const upstream = client.request({
    protocol: BACKEND.protocol,
    hostname: BACKEND.hostname,
    port: BACKEND.port || undefined,
    method: req.method,
    path: upstreamPath(target),
    headers: upstreamHeaders(req),
  })
  upstream.on('response', (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.statusMessage, downstreamHeaders(answer.rawHeaders))
    answer.pipe(res)
    answer.on('error', () => res.destroy())
  })
  upstream.on('error', (error) => {
    console.warn(`proxy: ${req.method} ${req.url} failed: ${error.message}`)
    badGateway(res)
  })
  // the browser gave up (navigation, timeout): so does the request to the gateway
  res.on('close', () => {
    if (!res.writableFinished) upstream.destroy()
  })
  req.pipe(upstream)
}

function writeHead(socket, statusCode, statusMessage, rawHeaders) {
  let head = `HTTP/1.1 ${statusCode} ${statusMessage ?? ''}\r\n`
  for (let i = 0; i < rawHeaders.length; i += 2) head += `${rawHeaders[i]}: ${rawHeaders[i + 1]}\r\n`
  socket.write(`${head}\r\n`)
}

/** The socket.io websocket: the upgrade is replayed to the gateway, then both sockets are piped together. */
function proxyUpgrade(req, socket, head) {
  socket.on('error', () => socket.destroy())
  const target = requestTarget(req.url)
  if (!target || !isApi(target.pathname)) {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    return
  }
  const upstream = client.request({
    protocol: BACKEND.protocol,
    hostname: BACKEND.hostname,
    port: BACKEND.port || undefined,
    method: req.method,
    path: upstreamPath(target),
    headers: upstreamHeaders(req, { upgrade: true }),
  })
  // the browser gave up before the gateway answered
  socket.on('close', () => upstream.destroy())
  upstream.on('upgrade', (answer, gateway, gatewayHead) => {
    gateway.on('error', () => socket.destroy())
    socket.on('close', () => gateway.destroy())
    gateway.on('close', () => socket.destroy())
    // 101's Connection / Upgrade headers are what makes it an upgrade: they are kept here
    writeHead(socket, answer.statusCode, answer.statusMessage, answer.rawHeaders)
    if (gatewayHead.length > 0) socket.write(gatewayHead)
    if (head.length > 0) gateway.write(head)
    gateway.pipe(socket).pipe(gateway)
  })
  // refused (401 without a valid access cookie, 429...): hand the answer over and close
  upstream.on('response', (answer) => {
    writeHead(socket, answer.statusCode ?? 502, answer.statusMessage, [...downstreamHeaders(answer.rawHeaders), 'Connection', 'close'])
    answer.pipe(socket)
  })
  upstream.on('error', (error) => {
    console.warn(`proxy: websocket ${req.url} failed: ${error.message}`)
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
  })
  upstream.end()
}

// ---------------------------------------------------------------- the /pictures proxy

function isPicture(pathname) {
  return pathname.startsWith(`${PICTURES_PREFIX}/`)
}

/** What a browser sends for an <img> that matters to Garage: content negotiation, caching, ranges. */
const PICTURE_REQUEST_HEADERS = ['accept', 'accept-encoding', 'if-none-match', 'if-modified-since', 'range', 'if-range']

/** '/pictures/seed/alice-1.webp' -> GET <PICTURES_URL>/seed/alice-1.webp, with the bucket's Host header. */
function proxyPicture(req, res, { pathname, search }) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    plain(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' })
    return
  }
  // a fresh header set, not the client's: the session cookies have no business reaching the bucket
  const headers = { host: PICTURES.host }
  for (const name of PICTURE_REQUEST_HEADERS) {
    if (req.headers[name] !== undefined) headers[name] = req.headers[name]
  }
  const upstream = picturesClient.request({
    protocol: PICTURES.protocol,
    hostname: connectHost(PICTURES),
    port: PICTURES.port || undefined,
    method: req.method,
    path: `${PICTURES_PATH}${pathname.slice(PICTURES_PREFIX.length)}${search}`,
    headers,
  })
  upstream.on('response', (answer) => {
    const out = downstreamHeaders(answer.rawHeaders)
    const present = new Set(out.filter((_, i) => i % 2 === 0).map((name) => name.toLowerCase()))
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!present.has(name.toLowerCase())) out.push(name, value)
    }
    res.writeHead(answer.statusCode ?? 502, answer.statusMessage, out)
    answer.pipe(res)
    answer.on('error', () => res.destroy())
  })
  upstream.on('error', (error) => {
    console.warn(`pictures: ${req.method} ${req.url} failed: ${error.message}`)
    if (res.headersSent) res.destroy()
    else plain(res, 502, 'Bad Gateway')
  })
  res.on('close', () => {
    if (!res.writableFinished) upstream.destroy()
  })
  upstream.end()
}

// ---------------------------------------------------------------- server

const server = http.createServer((req, res) => {
  const target = requestTarget(req.url)
  if (!target) {
    plain(res, 400, 'Bad Request')
    return
  }
  if (isApi(target.pathname)) {
    proxyRequest(req, res, target)
    return
  }
  if (isPicture(target.pathname)) {
    proxyPicture(req, res, target)
    return
  }
  serveStatic(req, res, target.pathname).catch((error) => {
    console.error(`static: ${req.url} failed`, error)
    if (res.headersSent) res.destroy()
    else plain(res, 500, 'Internal Server Error')
  })
})
server.on('upgrade', proxyUpgrade)

const built = await fileInfo(INDEX)
if (!built) {
  console.error('dist/index.html is missing: run `npm run build` first (or `npm run prod`, which builds and starts).')
  process.exit(1)
}

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use (a dev server?).` : error.message)
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  const where = `http://${HOST && HOST !== '0.0.0.0' && HOST !== '::' ? HOST : 'localhost'}:${PORT}`
  const api = API_PREFIX ? `${API_PREFIX}/* -> ${BACKEND.origin}${BACKEND_PATH}` : 'no proxy (the build calls the gateway directly)'
  console.log(`Matcha frontend (production) on ${where}, ${api}, ${PICTURES_PREFIX}/* -> ${PICTURES.origin}${PICTURES_PATH}`)
  if (!HOST || HOST === '0.0.0.0' || HOST === '::') {
    // listening on every interface: the addresses other devices can use (FRONTEND_URL in backend/.env)
    // Docker's bridges (docker0, br-*, veth*) are not reachable from other devices
    const lan = Object.entries(networkInterfaces())
      .filter(([name]) => !/^(docker|br-|veth)/.test(name))
      .flatMap(([, addresses]) => addresses ?? [])
      .filter((address) => address.family === 'IPv4' && !address.internal)
      .map((address) => `http://${address.address}:${PORT}`)
    if (lan.length > 0) console.log(`Other devices: ${lan.join(', ')} (set FRONTEND_URL in backend/.env to the one they use)`)
  }
})
