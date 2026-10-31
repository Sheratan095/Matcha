import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { AppService } from '../app.service';
import { cookieStateStore } from './oauthStateStore';
import { env } from '@repo/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github')
{
	private readonly logger = new Logger("AUTH GithubStrategy");

	constructor(private readonly appService: AppService)
	{
		super(
		{
			clientID: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
			callbackURL: env.GITHUB_CALLBACK_URL,
			scope: ['user:email'],
			// Every address with GitHub's primary/verified flags. By default the library keeps just the
			// primary one WITHOUT checking it is verified, and that address is what an existing
			// Matcha account gets linked by (validateOAuthUser), so it must be proven.
			allRawEmails: true,
			// CSRF protection for the callback (see oauthStateStore.ts)
			store: cookieStateStore,
		} as any);
	}

	// The validate method is called by Passport after a successful handshake with GitHub.
	// IT RECEIVES THE ACCESS TOKEN, OPTIONAL REFRESH TOKEN, AND THE USER'S GITHUB PROFILE.
	// They can be used to interact with GitHub's API if needed acting as client of github
	//	we use just the profile info
	// Nest's PassportStrategy calls passport's done() with whatever this RETURNS (or the error it
	// throws), so it must not call done() itself: that would answer passport twice.
	async validate(_accessToken: string, _refreshToken: string, profile: Profile): Promise<any>
	{
		const { id, username } = profile;
		// With allRawEmails each entry also carries GitHub's own primary / verified flags
		const emails = (profile.emails ?? []) as { value: string; primary?: boolean; verified?: boolean }[];
		const email = emails.find((entry) => entry.primary && entry.verified);

		if (!email)
		{
			this.logger.error(`GitHub OAuth validation failed: no verified primary email for GitHub ID ${id}`);
			throw (new UnauthorizedException('Your GitHub account has no verified primary email', 'NO_VERIFIED_EMAIL'));
		}

		// We delegate the user finding/creation logic to the AppService.
		const user = await this.appService.validateOAuthUser({
			provider: 'github',
			providerId: id,
			email: email.value.toLowerCase(),
			username,
		});

		this.logger.log(`GitHub OAuth validation successful for user ${username} (GitHub ID: ${id})`);

		// Becomes req.user for the callback route
		return (user);
	}
}

// What the frontend's login page receives as ?oauthError=<code> when a GitHub sign-in fails.
export type OAuthErrorCode = 'cancelled' | 'invalid_state' | 'no_verified_email' | 'failed';

// AuthGuard('github') on the CALLBACK, minus its default of throwing: a failed sign-in is a browser
// navigation, so an exception would leave the user on a raw JSON error page at the gateway's URL.
// Instead the guard always lets the request through, with req.user set on success and
// req.oauthError set on failure, and the controller redirects back to the frontend either way.
@Injectable()
export class GithubCallbackGuard extends AuthGuard('github')
{
	private readonly logger = new Logger('AUTH GithubCallbackGuard');

	handleRequest(err: any, user: any, info: any, context: ExecutionContext): any
	{
		if (user && !err)
			return (user);

		const	req = context.switchToHttp().getRequest();
		const	code = this.errorCode(err, info, req);

		this.logger.warn(`GitHub sign-in failed (${code}): ${err?.message ?? info?.message ?? 'no user'}`);
		req.oauthError = code;

		return (null);
	}

	private errorCode(err: any, info: any, req: any): OAuthErrorCode
	{
		// The user pressed "Cancel" on GitHub's consent screen: GitHub calls back with ?error=access_denied
		if (req.query?.error === 'access_denied')
			return ('cancelled');

		// Set by cookieStateStore.verify (oauthStateStore.ts)
		if (info?.message === 'Invalid OAuth state')
			return ('invalid_state');

		// Thrown by GithubStrategy.validate
		if (err?.response?.error === 'NO_VERIFIED_EMAIL')
			return ('no_verified_email');

		return ('failed');
	}
}
