import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { env } from "@repo/config";
import { DbService } from "../db/db.service";

@Injectable()
export class JwtHelper
{
	constructor(private readonly jwtService: JwtService) {}

	async generateTokens(userId: string) : Promise<{ access_token: string, refresh_token: string, refresh_token_expires_at: Date }>
	{
		const payload = { sub: userId };
		
		const [accessToken, refreshToken] = await Promise.all([
			this.jwtService.signAsync(payload, {
					secret: env.JWT_ACCESS_SECRET,
					expiresIn: env.JWT_ACCESS_EXPIRATION_MS,
			}),
			this.jwtService.signAsync(payload, {
					secret: env.JWT_REFRESH_SECRET,
					expiresIn: env.JWT_REFRESH_EXPIRATION_MS,
			}),
		]);

		const refreshTokenExpiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRATION_MS);

		return ({ access_token: accessToken, refresh_token: refreshToken, refresh_token_expires_at: refreshTokenExpiresAt });
	}

	async setTokensAsCookies(res: any, tokens: { access_token: string, refresh_token: string })
	{
		res.cookie('access_token', tokens.access_token, {
			httpOnly: true,
			secure: env.NODE_ENV === 'production', // Set secure flag ONLY in production
			sameSite: 'strict',
			maxAge: env.JWT_ACCESS_EXPIRATION_MS,
		});

		res.cookie('refresh_token', tokens.refresh_token, {
			httpOnly: true,
			secure: env.NODE_ENV === 'production', // Set secure flag ONLY in production
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

		if (dbService && userId)
			dbService.deleteRefreshToken(userId); // Ensure the refresh token is also removed from the database for security
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
}