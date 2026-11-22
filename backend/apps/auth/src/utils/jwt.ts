import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { env, SECURE_COOKIES } from "@repo/config";
import { DbService } from "../db/db.service";

@Injectable()
export class JwtHelper
{
	constructor(private readonly jwtService: JwtService) {}

	async generateTokens(userId: string) : Promise<{ access_token: string, refresh_token: string, refresh_token_expires_at: Date }>
	{
		const payload = { sub: userId };

		// jsonwebtoken reads a numeric expiresIn as SECONDS, while the env values are in ms
		const [accessToken, refreshToken] = await Promise.all([
			this.jwtService.signAsync(payload, {
					secret: env.JWT_ACCESS_SECRET,
					expiresIn: Math.floor(env.JWT_ACCESS_EXPIRATION_MS / 1000),
			}),
			this.jwtService.signAsync(payload, {
					secret: env.JWT_REFRESH_SECRET,
					expiresIn: Math.floor(env.JWT_REFRESH_EXPIRATION_MS / 1000),
			}),
		]);

		const refreshTokenExpiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRATION_MS);

		return ({ access_token: accessToken, refresh_token: refreshToken, refresh_token_expires_at: refreshTokenExpiresAt });
	}

	async setTokensAsCookies(res: any, tokens: { access_token: string, refresh_token: string })
	{
		res.cookie('access_token', tokens.access_token, {
			httpOnly: true,
			secure: SECURE_COOKIES, // Only when the frontend is served over HTTPS (see @repo/config)
			sameSite: 'strict',
			maxAge: env.JWT_ACCESS_EXPIRATION_MS,
		});

		res.cookie('refresh_token', tokens.refresh_token, {
			httpOnly: true,
			secure: SECURE_COOKIES, // Only when the frontend is served over HTTPS (see @repo/config)
			sameSite: 'strict',
			maxAge: env.JWT_REFRESH_EXPIRATION_MS,
		});
	}

	async revokeTokens(res: any, dbService?: DbService, userId?: string)
	{
		if (res)
		{
			res.clearCookie('access_token');
			res.clearCookie('refresh_token');
		}

		// Awaited: the caller (logout, password reset) must not report success before the refresh
		// token is actually gone, and a failure must reach it instead of becoming an unhandled rejection.
		if (dbService && userId)
			await dbService.deleteRefreshToken(userId);
	}

	// Return the user ID from the access token
	async validateAccessToken(token: string) : Promise<string>
	{
		// The expiration is automatically checked by the jwtService.verifyAsync method
		//so we don't need to manually check it here. If the token is expired,
		//it will throw an error which we can catch in the calling function.
		const payload = await this.jwtService.verifyAsync(token, {
			secret: env.JWT_ACCESS_SECRET,
		});

		// Payload should contain the user ID in the 'sub' claim as per our generateTokens method
		return (payload.sub);
	}

	// Return the user ID from the refresh token
	async validateRefreshToken(token: string) : Promise<string>
	{
		const payload = await this.jwtService.verifyAsync(token, {
			secret: env.JWT_REFRESH_SECRET,
		});

		return (payload.sub);
	}
}