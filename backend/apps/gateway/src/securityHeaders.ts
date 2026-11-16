import { INestApplication } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';

// Same shape the swagger-docs guard in main.ts matches: the UI, its assets, and the spec.
const	DOCS_PATH = /(^|\/)docs(-json)?(\/|$)/;

/**
 * @brief Baseline response headers for everything the gateway answers: defence in depth, so that
 * if a response is ever rendered as a page (a mis-typed content type, an error body, a user
 * navigating straight to an API URL), the browser has no room to treat it as one.
 *
 * - X-Content-Type-Options: nosniff     the browser must trust Content-Type, never sniff a JSON
 *                                       body into HTML.
 * - Content-Security-Policy              API responses are data, never documents: nothing may load,
 *                                       run or frame from them. The Swagger UI (/docs) is the one
 *                                       real page here and needs its own inline script and styles,
 *                                       so it only gets the anti-framing half.
 * - X-Frame-Options: DENY                same anti-framing for browsers that predate frame-ancestors.
 * - Referrer-Policy: no-referrer         a URL on this origin (they carry ids) is not leaked onward.
 * - X-Powered-By removed                 does not advertise the framework.
 *
 * Deliberately NOT set here:
 * - Strict-Transport-Security: only meaningful behind TLS, which is whatever fronts this process
 *   in production, so it belongs to that layer.
 * - Cross-Origin-Resource-Policy: the frontend is a different origin and reads these responses.
 *
 * Registered right after CORS in main.ts, BEFORE the rate limiters, so a 429 carries them too.
 * Headers a proxied service sets itself win over these, which is fine: the services set none.
 */
export function	applySecurityHeaders(app: INestApplication): void
{
	// Express setting, reached through the adapter because INestApplication does not expose it.
	(app.getHttpAdapter().getInstance() as { disable?: (setting: string) => void }).disable?.('x-powered-by');

	app.use((req: IncomingMessage, res: ServerResponse, next: () => void) =>
	{
		const	path = (req.url || '').split('?')[0];
		const	isDocs = DOCS_PATH.test(path);

		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader('X-Frame-Options', 'DENY');
		res.setHeader('Referrer-Policy', 'no-referrer');
		res.setHeader('Content-Security-Policy', isDocs ? "frame-ancestors 'none'" : "default-src 'none'; frame-ancestors 'none'");

		next();
	});
}
