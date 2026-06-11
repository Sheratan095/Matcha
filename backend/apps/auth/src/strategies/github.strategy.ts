import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { AppService } from '../app.service';
import { env } from '@repo/config';
import { Logger } from '@nestjs/common';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github')
{
	private readonly logger = new Logger("AUTH GithubStrategy");

	constructor(private readonly appService: AppService)
	{
		super({
			clientID: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
			callbackURL: env.GITHUB_CALLBACK_URL,
			scope: ['user:email'], });
	}

	// The validate method is called by Passport after a successful handshake with GitHub.
	// IT RECEIVES THE ACCESS TOKEN, OPTIONAL REFRESH TOKEN, AND THE USER'S GITHUB PROFILE.
	// They can be used to interact with GitHub's API if needed acting as client of github
	//	we use just the profile info
	async validate(profile: Profile, done: (error: any, user: any, info?: any) => void): Promise<any>
	{
		const { id, username, emails } = profile;

		// We delegate the user finding/creation logic to the AppService.
		const user = await this.appService.validateOAuthUser({
			provider: 'github',
			providerId: id,
			email: emails[0].value,
			username,
		});

		this.logger.log(`GitHub OAuth validation successful for user ${username} (GitHub ID: ${id})`);

		// By calling done(), we pass the internal user object to the Request object as 'req.user'.
		done(null, user);
	}
}
