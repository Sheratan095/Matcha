import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh')
{
	constructor()
	{
		super({
			jwtFromRequest: ExtractJwt.fromExtractors([
				(request: Request) =>
				{
					return (request?.cookies?.refresh_token);
				}
			]),
			ignoreExpiration: false,
			secretOrKey: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
			passReqToCallback: true,
		});
	}

	async validate(req: Request, payload: any)
	{
		const refreshToken = req.cookies?.refresh_token;

		if (!refreshToken)
			throw new UnauthorizedException('Refresh token is malformed or missing');

		return ({userId: payload.sub, username: payload.username, refreshToken });
	}
}
