import { Logger } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { authenticateRequest, USER_ID_HEADER } from '@repo/utils';

/**
 * @brief Reusable middleware for ANY proxied route that requires authentication.
 *
 * It validates the JWT once (by delegating to the auth service's /validate endpoint)
 * and injects the resulting userId as `USER_ID_HEADER` on the outgoing request, so the
 * downstream microservice can trust it and never has to parse tokens itself.
 *
 * Mount it BEFORE the proxy for the route it protects:
 *   app.use('/profile/upgrade', requireAuthenticatedUser(logger), createProxyMiddleware({ ... }));
 *
 * On the microservice side, pair it with `AuthenticatedUserGuard` + `@CurrentUser()`.
 */
export function requireAuthenticatedUser(logger: Logger)
{
	return (async (req: IncomingMessage, res: ServerResponse, next: () => void) =>
	{
		const	userId = await authenticateRequest(req);

		if (!userId)
		{
			logger.warn(`Rejected unauthenticated request to ${req.url}`);
			res.statusCode = 401;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ statusCode: 401, message: 'Unauthorized' }));

			return;
		}

		// Always overwrite so a client can never spoof the header.
		req.headers[USER_ID_HEADER] = userId;

		next();
	});
}
