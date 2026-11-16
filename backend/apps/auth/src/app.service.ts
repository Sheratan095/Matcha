import { Injectable, Logger, ForbiddenException, ConflictException, InternalServerErrorException, OnModuleInit, BadRequestException, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SupportedLanguage } from '@repo/shared-types';
import { DbService } from './db/db.service';
import { JwtHelper } from './utils/jwt';
import { issueJwtTokens, issueVerificationToken, issueForgotPasswordToken } from './utils/tokenIssuing';
import { User } from '@repo/shared-types';
import { hashPassword, comparePasswords, validatePassword } from './utils/password';
import { loadReservedUsernames, validateUsername, isReservedUsername, usernameFromProvider, usernameWithSuffix } from './utils/username';
import { createUserProfile, checkProfileCompleteness } from './utils/profile';
import { closeWsConnections, sendPasswordChangedEmail } from './utils/notification';

// Services contain the core business logic like the db calls

// The @Injectable() decorator marks the AppService class as a provider that can be injected into other classes (like controllers) in the NestJS framework
// This allows for dependency injection, making it easier to manage and test the application's components.
@Injectable()
export class AppService implements OnModuleInit
{
	private readonly logger = new Logger("AUTH AppService");

	constructor(
			private readonly dbService: DbService,
			private readonly jwtHelper: JwtHelper,
			private readonly httpService: HttpService )
	{}

	async onModuleInit()
	{
		// Paths are relative to the root of the @matcha/auth app (where it's executed)
		// infra/security/policies is at the root of the workspace
		// Since we are running from backend/apps/auth, we need to go up to backend/ and then to infra/
		await loadReservedUsernames('../../infra/security/policies/reserved-usernames.txt');
		this.logger.log('Reserved usernames initialization completed.');
	}

	async login(username: string, password: string, res: any)
	{
		try
		{
			// Hash the password and compare with stored hash in DB, then fetch user details
			const user: User | undefined = await this.dbService.getUserByUsername(username);

			if (!user)
			{
				this.logger.warn(`Failed login attempt for non-existent username: ${username}`);
				throw new ForbiddenException('Invalid credentials');
			}

			if (!await comparePasswords(password, user.passwordHash))
			{
				this.logger.warn(`Failed login attempt [wrong password] for user ${username} (ID: ${user.id})`);
				throw new ForbiddenException('Invalid credentials');
			}

			if (user.emailVerified === false)
			{
				this.logger.warn(`Login attempt with unverified email for user ${username} (ID: ${user.id})`);
				await issueVerificationToken(user, this.dbService, this.httpService, this.logger);
				throw new ForbiddenException('Email not verified', 'EMAIL_NOT_VERIFIED');
			}

			// Before issuing the tokens: if the profile service is down, the login fails as a 500
			// WITHOUT having set the auth cookies (a "failed" login must not leave the user logged in).
			const isProfileComplete : boolean = await checkProfileCompleteness(user.id, this.httpService);

			await issueJwtTokens(user, res, this.dbService, this.jwtHelper, this.httpService, this.logger);

			this.logger.log(`Login successful for user ${username} (ID: ${user.id}, COMPLETE: ${isProfileComplete})`);

			return ({ message: 'Login successful', userId: user.id, isProfileComplete });
		}
		catch (error: any)
		{
			this.logger.error('Error during login', error);

			if (error instanceof ForbiddenException)
				throw error;

			// Fallback for other DB / unexpected errors
			throw new InternalServerErrorException('Login failed');
		}

	}

	async register(email: string, username: string, password: string, language: SupportedLanguage, firstName: string, lastName: string, dateOfBirth: string, res: any)
	{
		await validatePassword(password, null, [username, email, firstName, lastName]);
		const passwordHash = await hashPassword(password);

		// DON'T NEED IT BECAUSE THE NORMALIZATION IS DONE IN DTO
		// username = username.toLowerCase().trim();
		// email = email.toLowerCase().trim();

		validateUsername(username);

		try
		{
			const newUser: User = await this.dbService.createUser(email, username, passwordHash, language);

			// TOKENS ARE ISSUED AFTER EMAIL VERIFICATION AND THEN LOGIN, NOT DURING REGISTRATION
			// await this.issueJwtTokens(newUser.id, res);

			try
			{
				// Create the matching profile row (1:1 with the user) in the profile service.
				// first/last name and date of birth live in the profiles table, so they are passed along here.
				await createUserProfile(newUser.id, firstName, lastName, dateOfBirth, this.httpService);
				this.logger.log(`Profile created for user ID ${newUser.id}`);

			}
			catch (error: any)
			{
				await this.dbService.deleteUser(newUser.id);

				// The profile service answers 400 when the database refuses the date of birth (not a
				// real date, or under 18) or a name (profiles_*_name_format_check). That is the user's
				// mistake, so relay it as a 400 with the same message instead of collapsing it into a 500.
				if (error?.response?.status === 400)
					throw new BadRequestException(error.response.data?.message ?? 'Invalid profile data');

				this.logger.error('Error creating user profile -> consequential removing of user entity from db ', error);

				throw new InternalServerErrorException('Failed to create user profile');
			}

			this.logger.log(`User registered with email ${email} and username ${username}, assigned ID ${newUser.id}`);

			await issueVerificationToken(newUser, this.dbService, this.httpService, this.logger);

			return ({ message: 'Email verification required', date: new Date(), userId: newUser.id });
		}
		catch (error: any)
		{
			// Already decided above (e.g. the 400 for a bad date of birth): pass it through
			// instead of turning it into the generic 500 below.
			if (error instanceof HttpException)
				throw (error);

			this.logger.error('Error during user registration', error);

			// PostgreSQL unique violation error code is '23505'
			if (error && error.code === '23505')
			{
				if (error.detail && error.detail.includes('username'))
					throw new ConflictException('User already exists');
				if (error.detail && error.detail.includes('email'))
					throw new ConflictException('Email already in use');
			}

			// Fallback for other DB / unexpected errors
			throw new InternalServerErrorException('User registration failed');
		}
	}

	async changeEmail(userId: string, newEmail: string)
	{
		const user = await this.dbService.getUserById(userId);
		if (!user)
		{
			this.logger.warn(`Email change attempt for non-existent user ID: ${userId}`);
			throw new ForbiddenException('User not found');
		}

		if (user.email === newEmail)
		{
			this.logger.warn(`Email change attempt for same email: ${newEmail} for user ID: ${userId}`);
			throw new BadRequestException('New email is the same as the current email');
		}

		// Check if the new email is already in use by another account
		if (await this.dbService.emailExists(newEmail))
		{
			this.logger.warn(`Email change attempt to an already existing email: ${newEmail} for user ID: ${userId}`);
			throw new ConflictException('Email already exists');
		}

		// Store the new email as pending; the active (verified) email is left untouched
		// until the user verifies ownership of the new address.
		await this.dbService.setPendingEmail(userId, newEmail);

		this.logger.log(`Email change initiated for user ID ${userId}. ${user.email} -> ${newEmail}`);

		// Issue a new verification token, sent to the new (pending) address
		await issueVerificationToken(user, this.dbService, this.httpService, this.logger, newEmail);

		return ({ message: 'Email change initiated. Please verify your new email address.' });
	}

	async verifyEmail(tokenPlain: string, res: any)
	{
		const verificationTokenRecord = await this.dbService.getVerificationTokenRecord(tokenPlain);

		if (!verificationTokenRecord || new Date(verificationTokenRecord.expires_at) < new Date())
		{
			this.logger.warn(`Verification token attempt with invalid or expired token: ${tokenPlain}`);
			throw new ForbiddenException('Invalid or expired verification token');
		}

		await this.dbService.markUserEmailVerified(verificationTokenRecord.user_id);

		await this.dbService.deleteVerificationToken(verificationTokenRecord.user_id);

		this.logger.log(`Email verified successfully for user ID ${verificationTokenRecord.user_id}`);

		return ({ message: 'Email verified successfully', userId: verificationTokenRecord.user_id });
	}

	async logout(userId: string, res: any)
	{
		// Fire-and-forget: a notification-service hiccup must not fail the logout.
		closeWsConnections(userId, this.httpService)
			.catch(err => this.logger.warn(`Failed to close WebSocket connections for user ${userId}: ${err.message}`));

		this.logger.log(`User ID ${userId} logged out, closing WebSocket connections`);

		// Clears the auth cookies (res) AND deletes the refresh token from the DB (userId) so a
		// stolen refresh token can't outlive the logout.
		await this.jwtHelper.revokeTokens(res, this.dbService, userId);

		return ({ message: 'Logged out successfully' });
	}

	async refreshTokens(userId: string, refreshTokenPlain: string, res: any)
	{
		const isValidToken = await this.dbService.getRefreshTokenRecord(refreshTokenPlain, userId);

		if (!isValidToken || isValidToken.user_id !== userId || new Date(isValidToken.expires_at) < new Date())
			throw new ForbiddenException('Invalid refresh token');

		const user: User | undefined = await this.dbService.getUserById(userId);
		if (!user)
			throw new ForbiddenException('User not found');

		await issueJwtTokens(user, res, this.dbService, this.jwtHelper, this.httpService, this.logger);

		this.logger.log(`Tokens refreshed successfully for user ID ${userId}`);

		return ({ message: 'Tokens refreshed', userId });
	}

	async validateToken(token: string)
	{
		try
		{
			const userId: string = await this.jwtHelper.validateAccessToken(token);
			// this.logger.log(`Token valid for user ID: ${userId}`);

			return ({ valid: true, userId });
		}
		catch (error)
		{
			this.logger.warn(`Token invalid`);
			return ({ valid: false, userId: null });
		}
	}

	// Used after successful GitHub OAuth login to issue our own JWT tokens and set them as cookies
	async issueTokensAfterOAuth(user: User, res: any)
	{
		await issueJwtTokens(user, res, this.dbService, this.jwtHelper, this.httpService, this.logger);
	}

	async forgotPassword(email: string)
	{
		const user: User | undefined = await this.dbService.getUserByEmail(email);

		// To prevent EMAIL ENUMERATION ATTACKS, we return the same success message
		// regardless of whether the email exists. This way, attackers
		// cannot determine if an email is registered in the system.
		if (!user)
		{
			this.logger.debug(`Forgot password attempt with non-existent email: ${email}`);
			return ({ message: 'If an account with this email exists, you will receive a password reset link shortly' });
		}

		if (user.emailVerified === false)
			this.logger.warn(`Forgot password initiated for unverified email: ${email} (ID: ${user.id})`);

		await issueForgotPasswordToken(user, this.dbService, this.httpService, this.logger);

		return ({ message: 'If an account with this email exists, you will receive a password reset link shortly' });
	}

	async resetPassword(tokenPlain: string, password: string)
	{
		const resetTokenRecord = await this.dbService.getForgotPasswordTokenRecord(tokenPlain);

		if (!resetTokenRecord || new Date(resetTokenRecord.expires_at) < new Date())
		{
			this.logger.warn(`Reset password attempt with invalid or expired token`);
			throw new ForbiddenException('Invalid or expired reset token');
		}

		// DON'T NEED TO VERIFY EMAIL AGAIN BECAUSE
		// THE FORGOT PASSWORD PROCESS CAN ONLY BE INITIATED IF THE EMAIL IS VERIFIED
		// if (User.email_verified === false)
		// {
		// 	this.logger.warn(`Reset password attempt with unverified email for user with ID ${User.id}`);
		// 	await issueVerificationToken(User, this.dbService, this.httpService, this.logger);
		// 	throw new ForbiddenException('Email not verified', 'EMAIL_NOT_VERIFIED');
		// }

		const user = await this.dbService.getUserById(resetTokenRecord.user_id);
		if (!user)
			throw new ForbiddenException('User not found');

		await validatePassword(password, user.passwordHash, [user.username, user.email]);

		// Save and hash the new password, then invalidate the reset token
		const passwordHash = await hashPassword(password);
		await this.dbService.updateUserPassword(user.id, passwordHash);

		// Invalidate the reset token after successful password reset
		await this.dbService.deleteForgotPasswordToken(user.id);

		// Invalidate all existing tokens
		await this.jwtHelper.revokeTokens(null, this.dbService, user.id);

		// Sockets are authenticated once, at the handshake, so revoking tokens doesn't touch the open
		// ones: a session the reset is meant to kick out would keep receiving live notifications.
		// Fire-and-forget like logout: a notification-service hiccup must not fail the reset.
		closeWsConnections(user.id, this.httpService)
			.catch(err => this.logger.warn(`Failed to close WebSocket connections for user ${user.id}: ${err.message}`));

		// The user's alarm bell if they did not make the change (someone who got hold of their email
		// could have). Fire-and-forget: the password IS changed, a mail hiccup must not report otherwise.
		sendPasswordChangedEmail(user.email, user.language, this.httpService)
			.catch(err => this.logger.warn(`Failed to send password changed email to user ${user.id}: ${err.message}`));

		this.logger.log(`Password reset successful for user ID ${user.id}`);

		return ({ message: 'Password reset successfully' });
	}

	// This method handles the logic of whether to create a new user or link an existing one.
	// The GitHub handle, made valid for our username rule, else the same base with a random suffix
	// when it is reserved or taken. The insert itself is the final check: a sign-up that grabs the
	// same name between the lookup and the insert surfaces as a unique violation, and the next
	// candidate is tried instead of answering 500.
	private async createOAuthUserWithFreeUsername(email: string, handle: string, provider: string, providerId: string): Promise<User>
	{
		const	base = usernameFromProvider(handle);
		const	maxAttempts = 10;

		for (let attempt = 0; attempt < maxAttempts; attempt++)
		{
			const	candidate = attempt === 0 ? base : usernameWithSuffix(base);

			if (isReservedUsername(candidate) || await this.dbService.getUserByUsername(candidate))
				continue;

			try
			{
				return (await this.dbService.createOAuthUser({ email, username: candidate, provider, providerId }));
			}
			catch (error: any)
			{
				if (error?.code === '23505' && error.constraint === 'users_username_key')
					continue;

				throw (error);
			}
		}

		throw (new InternalServerErrorException('Could not find a free username'));
	}

	async validateOAuthUser(profile: { provider: string; providerId: string; email: string; username: string;})
	{
		const { provider, providerId, email, username } = profile;

		// 1. Try to find the user by their OAuth identity first.
		let user = await this.dbService.getUserByOAuth(provider, providerId);
		if (user)
			return (user);

		// 2. If not found by OAuth, check if a user with this email already exists (manual registration).
		user = await this.dbService.getUserByEmail(email);

		// An UNVERIFIED ACCOUNT WITH THIS EMAIL IS NEVER LINKED: nothing proves its creator owns the
		// address, while GitHub just proved this user does. Linking would be account PRE-HIJACKING:
		// someone registers with the victim's email and a password of their own, never verifies, waits
		// for the victim to sign in with GitHub, and keeps a working password on the victim's account.
		// It is deleted instead and a fresh account is created below. Nothing is lost: an unverified
		// account can't log in, so it never got past registration.
		if (user && !user.emailVerified)
		{
			this.logger.warn(`Deleting unverified account ID ${user.id} (${email}): the address was just proven by ${provider} sign-in`);
			await this.dbService.deleteUser(user.id);
			user = undefined;
		}

		if (!user)
		{
			// REGISER NEW USER WITH THIS OAUTH IDENTITY

			user = await this.createOAuthUserWithFreeUsername(email, username, provider, providerId);

			try
			{
				// No date of birth: GitHub does not provide one. The user sets it once via PATCH /profile.
				await createUserProfile(user.id, undefined, undefined, undefined, this.httpService);
			}
			catch (error)
			{
				// If profile creation fails, we should clean up by deleting the user we just created to avoid orphaned records.
				await this.dbService.deleteUser(user.id);
				this.logger.error(`Error creating user profile for user ID ${user.id}: ${error}`);

				throw (error);
			}

			this.logger.log(`Created new user with ID ${user.id}, username: ${user.username} for OAuth provider ${provider} (provider ID: ${providerId})`);
		}
		else
		{
			// If the user already exists (e.g., they registered manually before), we link this OAuth provider
			// to their existing account so they can log in via either method in the future.
			await this.dbService.linkOAuthAccount(user.id, provider, providerId);

			this.logger.log(`Linked existing user ID ${user.id}, username: ${user.username} to OAuth provider ${provider} (provider ID: ${providerId})`);
		}
	
		return (user);
	}
}
