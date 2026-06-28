import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtHelper } from '../utils/jwt';

// Guards run before the route handler. When applied with @UseGuards(JwtAuthGuard),
// NestJS calls canActivate() first — if it returns false or throws, the handler never runs.
//
// Usage on a route:
//   @UseGuards(JwtAuthGuard)
//   async myEndpoint(@CurrentUser() userId: string) { ... }
//
// The guard extracts the userId and stores it on the request object.
// The @CurrentUser() decorator (see decorators/current-user.decorator.ts) then reads it
// from the request so you don't have to touch cookies or tokens in the handler.
@Injectable()
export class JwtAuthGuard implements CanActivate
{
	constructor(private readonly jwtHelper: JwtHelper) {}

	// it's like the "main" function of the guard. It runs before the route handler.
	async canActivate(context: ExecutionContext): Promise<boolean>
	{
		// Get the request object from the execution context. This is where NestJS stores HTTP request data.
		const request = context.switchToHttp().getRequest();

		// The access token is stored as an HTTP-only cookie, so the client never touches it directly.
		// It is set by the login/refresh endpoints via JwtHelper.setTokensAsCookies().
		const token = request.cookies?.access_token;

		if (!token)
			throw new UnauthorizedException('Missing access token');

		// validateAccessToken verifies the signature and expiration, then returns the userId
		// stored in the 'sub' claim (see JwtHelper.generateTokens).
		const userId = await this.jwtHelper.validateAccessToken(token).catch(() => {
			throw new UnauthorizedException('Invalid or expired access token');
		});

		// Attach userId to the request so downstream decorators and handlers can read it
		// without repeating token parsing logic.
		request.userId = userId;

		return (true);
	}
}
