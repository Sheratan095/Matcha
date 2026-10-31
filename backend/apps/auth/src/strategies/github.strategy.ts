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
			scope: ['user:email'],
			// Every address with GitHub's primary/verified flags. By default the library keeps just the
			// primary one WITHOUT checking it is verified, and that address is what an existing
			// Matcha account gets linked by (validateOAuthUser), so it must be proven.
			allRawEmails: true, } as any);
	}

	// The validate method is called by Passport after a successful handshake with GitHub.
	// IT RECEIVES THE ACCESS TOKEN, OPTIONAL REFRESH TOKEN, AND THE USER'S GITHUB PROFILE.
	// They can be used to interact with GitHub's API if needed acting as client of github
	//	we use just the profile info
	async validate(_accessToken: string, _refreshToken: string, profile: Profile, done: (error: any, user: any, info?: any) => void): Promise<any>
	{
		const { id, username } = profile;
		// With allRawEmails each entry also carries GitHub's own primary / verified flags
		const emails = (profile.emails ?? []) as { value: string; primary?: boolean; verified?: boolean }[];
		const email = emails.find((entry) => entry.primary && entry.verified);

		if (!email)
		{
			this.logger.error(`GitHub OAuth validation failed: no verified primary email for GitHub ID ${id}`);
			return (done(new Error('Your GitHub account has no verified primary email'), null));
		}

		// We delegate the user finding/creation logic to the AppService.
		const user = await this.appService.validateOAuthUser({
			provider: 'github',
			providerId: id,
			email: email.value.toLowerCase(),
			username,
		});

		this.logger.log(`GitHub OAuth validation successful for user ${username} (GitHub ID: ${id})`);

		// By calling done(), we pass the internal user object to the Request object as 'req.user'.
		done(null, user);
	}
}
