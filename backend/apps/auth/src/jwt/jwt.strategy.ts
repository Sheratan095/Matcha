import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { env } from "@repo/config";


@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy)
{
	constructor()
	{
		super({
			// Extract JWT from cookies (access_token cookie)
			jwtFromRequest: ExtractJwt.fromExtractors([ (request: Request) => { return (request?.cookies?.access_token); }, ]),
			ignoreExpiration: false,
			secretOrKey: env.JWT_ACCESS_SECRET, // Ensure to use environment variables in production
		});
	}

	async validate(payload: any)
	{
		// This payload is what was encoded in the JWT
		// You can fetch more user details from db if necessary here
		return { userId: payload.sub, username: payload.username };
	}
}
