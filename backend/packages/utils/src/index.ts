import { env } from '@repo/config';
import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';

// JWT / authenticated-user helpers, shared by every service that needs to know
// WHO is calling (see auth.ts). Re-exported here so consumers keep importing from '@repo/utils'.
export * from './auth';

/**
 * @brief Validate that a provided key matches the configured internal key.
 *
 * This helper checks the incoming value against `env.INTERNAL_KEY` and
 * returns `true` only when an internal key is configured and the
 * supplied key exactly equals that value.
 *
 * @param key The key extracted from the incoming request headers.
 * @return `true` when the key is present and matches `env.INTERNAL_KEY`, `false` otherwise.
 */
export function	validateInternalKey(key?: string): boolean
{
	return (Boolean(env.INTERNAL_KEY && key === env.INTERNAL_KEY));
}


/**
 * @brief Guard that enforces internal service-to-service authentication.
 *
 * Apply this `InternalKeyGuard` on controllers or routes to ensure that
 * incoming HTTP requests include a valid `x-internal-key` header. The
 * GUARD DELEGATES THE ACTUAL COMPARISON TO `VALIDATEINTERNALKEY` SO THE
 * VALIDATION LOGIC IS CENTRALIZED AND TESTABLE.
 *
 * Important notes:
 *  - The header is expected to be provided by trusted internal callers
 *    (e.g. the API gateway when proxying requests between services).
 *  - Failure results in an `UnauthorizedException` being thrown,
 *    preventing the request handler from executing.
 *  - Using guard and not a "check in parameter decorator" allows us to
 *    test api using swagger without needing to add the internal key
 */
@Injectable()
export class InternalKeyGuard implements CanActivate
{
	/**
	 * @brief Called by Nest to determine whether a request is allowed.
	 *
	 * This method extracts the `x-internal-key` header from the request,
	 * validates it using `validateInternalKey` and throws
	 * `UnauthorizedException` when the key is missing or invalid.
	 *
	 * @param context The execution context provided by NestJS.
	 * @return `true` when the request contains a valid internal key.
	 * @throws `UnauthorizedException` when validation fails.
	 */
	canActivate(context: ExecutionContext): boolean
	{
		const	request = context.switchToHttp().getRequest();
		const	key = request.headers['x-internal-key'];

		if (!validateInternalKey(key))
			throw (new UnauthorizedException('Invalid or missing internal key'));

		return (true);
	}
}

// Matches every path SwaggerModule serves: the UI ('/docs'), the spec ('/docs-json'),
// the UI's static assets ('/docs/swagger-ui-bundle.js') and the notification service's
// extra '/docs-json' mount ('/docs-json-json').
const	DOCS_PATH = /^\/docs([-/]|$)/;

// Only the few members the middleware below touches, so this package does not need
// @types/node or @types/express just to describe a request it merely inspects.
type	DocsRequest = { url?: string; method?: string; headers: Record<string, unknown> };
type	DocsResponse = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void };

/**
 * @brief Make a microservice's own Swagger docs internal-only.
 *
 * Every service mounts its docs at '/docs' on its OWN port, reachable by anyone who can
 * hit that port — the gateway's DOCS_USER/DOCS_PASSWORD only guards what goes THROUGH the
 * gateway. This middleware closes that door by requiring the same 'x-internal-key' as every
 * other internal endpoint, so a service's docs are readable only via the gateway (which
 * injects the key when proxying) and therefore only behind the gateway's Basic auth.
 *
 * It has to be MIDDLEWARE rather than `InternalKeyGuard`: SwaggerModule.setup() registers
 * raw Express handlers, not Nest controllers, so guards never run for them. For the same
 * reason it must be registered BEFORE the SwaggerModule.setup() calls — hence each service
 * calls it as the FIRST statement of its own swaggerSetup(), so docs can never be mounted
 * without their guard.
 *
 * The path deliberately stays '/docs' instead of moving under '/internal/': the gateway
 * rejects any path containing an 'internal' segment before its proxies run, which would
 * 404 the aggregate docs page's own spec fetches.
 *
 * Answers 404 instead of 401 — like the gateway's internal blocker — so an outside caller
 * cannot even confirm the docs exist.
 *
 * @param app The Nest application, before swagger is set up on it.
 * @param serviceName Name used for the log line when a request is blocked.
 */
export function	protectDocsWithInternalKey(app: any, serviceName: string): void
{
	const	logger = new Logger(`${serviceName} Docs`);

	app.use((req: DocsRequest, res: DocsResponse, next: () => void) =>
	{
		const	path = (req.url || '').split('?')[0];

		if (!DOCS_PATH.test(path))
			return (next());

		if (validateInternalKey(req.headers['x-internal-key'] as string | undefined))
			return (next());

		logger.warn(`Blocked direct docs request without a valid internal key: ${req.method} ${path}`);
		res.statusCode = 404;
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify({ statusCode: 404, message: 'Not Found' }));
	});
}