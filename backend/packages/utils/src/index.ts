import { env } from '@repo/config';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

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