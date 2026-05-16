import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { env } from 'process';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh')
{
	constructor()
	{
		super({
			jwtFromRequest: ExtractJwt.fromExtractors([
				(request: Request) => { return (request?.cookies?.refresh_token); }
			]),
			ignoreExpiration: false,
			secretOrKey: env.JWT_REFRESH_SECRET,
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
