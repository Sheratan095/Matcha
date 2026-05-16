import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { env } from "@repo/config";

@Injectable()
export class JwtHelper
{
	constructor(private readonly jwtService: JwtService) {}

	async generateTokens(user: any) : Promise<{ access_token: string, refresh_token: string }>
	{
		const payload = { username: user.username, sub: user.userId };
		
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

		return ({ access_token: accessToken, refresh_token: refreshToken, });
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

	async clearTokens(res: any)
	{
		res.clearCookie('access_token');
		res.clearCookie('refresh_token');
	}
}