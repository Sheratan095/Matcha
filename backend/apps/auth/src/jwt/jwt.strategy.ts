import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy)
{
	constructor()
	{
		super({
			jwtFromRequest: ExtractJwt.fromExtractors([
			(request: Request) => {
			return request?.cookies?.access_token;
			},
		]),
		ignoreExpiration: false,
		secretOrKey: process.env.JWT_SECRET || 'fallback_secret_key', // Ensure to use environment variables in production
		});
	}

	async validate(payload: any)
	{
		// This payload is what was encoded in the JWT
		// You can fetch more user details from db if necessary here
		return { userId: payload.sub, username: payload.username };
	}
}
