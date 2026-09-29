import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { env } from '@repo/config';
import axios from 'axios';

/**
 * @brief Header used to carry the AUTHENTICATED userId from the gateway to the microservices.
 *
 * The gateway injects it BY DEFAULT on every proxied request that carries a valid access
 * token, and STRIPS it unconditionally beforehand, so a client can never supply its own
 * value. Downstream services can therefore trust it (they also sit behind
 * `InternalKeyGuard`, so only the gateway and other internal services can reach them).
 *
 * Its presence means "this caller is authenticated"; its absence means "anonymous", NOT
 * "forbidden" — rejecting is up to `AuthenticatedUserGuard` on the endpoint.
 */
export const USER_ID_HEADER = 'x-user-id';

const logger = new Logger('AuthValidation');

/**
 * @brief Validate an access token by delegating to the AUTH service.
 *
 * This is the single place where "is this JWT valid, and who is it?" is answered.
 * It calls the auth service's `/validate` endpoint rather than verifying the
 * signature locally, so the JWT secret stays confined to the auth service.
 *
 * The auth controller sits behind `InternalKeyGuard`, so the internal key is sent
 * alongside the caller's Cookie header (auth reads `req.cookies.access_token`).
 *
 * @param cookieHeader The raw `Cookie` header from the incoming request.
 * @return The userId when the token is valid, `null` otherwise.
 */
async function validateAccessTokenCookie(cookieHeader?: string): Promise<string | null>
{
	// No cookies -> no access token to validate.
	if (!cookieHeader)
		return (null);

	try
	{
		const response = await axios.get(`${env.AUTH_HOST}:${env.AUTH_PORT}/validate`,
		{
			headers:
			{
				cookie: cookieHeader,
				'x-internal-key': env.INTERNAL_KEY,
			},
		});

		if (response.data?.valid && response.data.userId)
			return (String(response.data.userId));

		return (null);
	}
	catch (err)
	{
		logger.error('Access token validation failed', err);

		return (null);
	}
}

/**
 * @brief Authenticate anything that carries HTTP headers.
 *
 * Works for a raw `IncomingMessage` (websocket upgrade), an Express request, or a
 * socket.io handshake, so the same logic covers HTTP endpoints and socket connections.
 *
 * @param req Any object exposing a `headers` map.
 * @return The userId when the request carries a valid access token, `null` otherwise.
 */
export async function authenticateRequest(req: { headers?: Record<string, any> }): Promise<string | null>
{
	
	return (await validateAccessTokenCookie(req?.headers?.cookie));
}

/**
 * @brief GUARD THAT REQUIRES AN AUTHENTICATED USER ON A MICROSERVICE ENDPOINT.
 *
 * Apply it to any route that must know who the caller is:
 *   @UseGuards(InternalKeyGuard, AuthenticatedUserGuard)
 *   async myEndpoint(@CurrentUser() userId: string) { ... }
 *
 * It first looks for the `USER_ID_HEADER` injected by the gateway (the normal path,
 * no extra network hop). If that header is absent it falls back to validating the
 * access_token cookie directly, so the endpoint also works when called without the
 * gateway (e.g. service-to-service or while testing through Swagger).
 *
 * The resolved id is attached to the request as `userId`, which `@CurrentUser()` reads.
 */
@Injectable()
export class AuthenticatedUserGuard implements CanActivate
{
	async canActivate(context: ExecutionContext): Promise<boolean>
	{
		const	request = context.switchToHttp().getRequest();

		// Preferred path: the gateway already authenticated and injected the id.
		let	userId = request.headers?.[USER_ID_HEADER];

		// Fallback: validate the cookie ourselves (no gateway in front of us).
		if (!userId)
			userId = await validateAccessTokenCookie(request.headers?.cookie);

		if (!userId)
			throw (new UnauthorizedException('Missing or invalid access token'));

		// Attach it so handlers and @CurrentUser() never parse tokens themselves.
		request.userId = String(userId);

		return (true);
	}
}

/**
 * @brief Parameter decorator that injects the authenticated userId into a handler.
 *
 * Requires `AuthenticatedUserGuard` (or any guard setting `request.userId`) to have run.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
{
	const	request = context.switchToHttp().getRequest();

	return (request.userId);
});
