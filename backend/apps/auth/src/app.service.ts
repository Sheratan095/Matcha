import { Injectable, Logger, ForbiddenException, ConflictException, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SupportedLanguage } from '@repo/shared-types';
import { DbService } from './db/db.service';
import { JwtHelper } from './utils/jwt';
import { issueJwtTokens, issueVerificationToken, issueForgotPasswordToken } from './utils/tokenIssuing';
import { User } from '@repo/shared-types';
import { hashPassword, comparePasswords, loadCommonPasswords, validatePassword } from './utils/password';
import { loadReservedUsernames, validateUsername, generateFallbackUsername } from './utils/username';

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
		await loadCommonPasswords('../../infra/security/policies/common-password.txt');
		this.logger.log('Common passwords initialization completed.');

		await loadReservedUsernames('../../infra/security/policies/reserved-usernames.txt');
		this.logger.log('Reserved usernames initialization completed.');
	}

	async login(username: string, password: string, res: any)
	{
		// Hash the password and compare with stored hash in DB, then fetch user details
		const user: User | undefined = await this.dbService.getUserByUsername(username);

		if (!user)
		{
			this.logger.warn(`Failed login attempt for non-existent username: ${username}`);
			throw new ForbiddenException('Invalid credentials');
		}

		if (!await comparePasswords(password, user.password_hash))
		{
			this.logger.warn(`Failed login attempt for user ${username} (ID: ${user.id})`);
			throw new ForbiddenException('Invalid credentials');
		}

		if (user.email_verified === false)
		{
			this.logger.warn(`Login attempt with unverified email for user ${username} (ID: ${user.id})`);
			await issueVerificationToken(user, this.dbService, this.httpService, this.logger);
			throw new ForbiddenException('Email not verified', 'EMAIL_NOT_VERIFIED');
		}

		await issueJwtTokens(user, res, this.dbService, this.jwtHelper, this.httpService, this.logger);

		this.logger.log(`Login successful for user ${username} (ID: ${user.id})`);

		return ({ message: 'Login successful', userId: user.id });
	}

	async register(email: string, username: string, password: string, language: SupportedLanguage, firstName: string, lastName: string, res: any)
	{
		await validatePassword(password);
		const passwordHash = await hashPassword(password);

		// DON'T NEED IT BECAUSE THE NORMALIZATION IS DONE IN DTO
		// username = username.toLowerCase().trim();
		// email = email.toLowerCase().trim();

		validateUsername(username);

		try
		{
			const newUser: User = await this.dbService.createUser(email, username, passwordHash, language, firstName, lastName);

			// TOKENS ARE ISSUED AFTER EMAIL VERIFICATION AND THEN LOGIN, NOT DURING REGISTRATION
			// await this.issueJwtTokens(newUser.id, res);

			this.logger.log(`User registered with email ${email} and username ${username}, assigned ID ${newUser.id}`);

			await issueVerificationToken(newUser, this.dbService, this.httpService, this.logger);

			return { message: 'Email verification required', date: new Date(), userId: newUser.id };
		}
		catch (error: any)
		{
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

		// Check if the new email is already in use by another account
		if (await this.dbService.emailExists(newEmail))
		{
			this.logger.warn(`Email change attempt to an already existing email: ${newEmail} for user ID: ${userId}`);
			throw new ConflictException('Email already exists');
		}

		// Update the user's email and mark it as unverified
		await this.dbService.updateUserEmail(userId, newEmail);

		// Issue a new verification token for the new email address
		await issueVerificationToken(user, this.dbService, this.httpService, this.logger);

		this.logger.log(`Email change initiated for user ID ${userId}. New email: ${newEmail}`);

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

	async logout(res: any)
	{
		// Refresh token is also removed from db
		await this.jwtHelper.revokeTokens(res, this.dbService);
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

		return ({ message: 'Tokens refreshed', userId });
	}

	async validateToken(token: string)
	{
		try
		{
			const userId: string = await this.jwtHelper.validateAccessToken(token);
			this.logger.log(`Token valid for user ID: ${userId}`);

			return ({ valid: true, userId });
		}
		catch (error)
		{
			this.logger.log(`Token invalid`);
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

		if (user.email_verified === false)
			this.logger.warn(`Forgot password initiated for unverified email: ${email} (ID: ${user.id})`);

		await issueForgotPasswordToken(user, this.dbService, this.httpService, this.logger);

		return ({ message: 'If an account with this email exists, you will receive a password reset link shortly' });
	}

	async resetPassword(tokenPlain: string, password: string)
	{
		const resetTokenRecord = await this.dbService.getForgotPasswordTokenRecord(tokenPlain);

		if (!resetTokenRecord || new Date(resetTokenRecord.expires_at) < new Date())
			throw new ForbiddenException('Invalid or expired reset token');

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

		await validatePassword(password, user.password_hash);

		// Save and hash the new password, then invalidate the reset token
		const passwordHash = await hashPassword(password);
		await this.dbService.updateUserPassword(user.id, passwordHash);

		// Invalidate the reset token after successful password reset
		await this.dbService.deleteForgotPasswordToken(user.id);

		// Invalidate all existing tokens
		await this.jwtHelper.revokeTokens(null, this.dbService, user.id);

		this.logger.log(`Password reset successful for user ID ${user.id}`);

		return ({ message: 'Password reset successfully' });
	}

	// This method handles the logic of whether to create a new user or link an existing one.
	async validateOAuthUser(profile: { provider: string; providerId: string; email: string; username: string;})
	{
		const { provider, providerId, email, username } = profile;

		// 1. Try to find the user by their OAuth identity first.
		let user = await this.dbService.getUserByOAuth(provider, providerId);
		if (user)
			return (user);

		// 2. If not found by OAuth, check if a user with this email already exists (manual registration).
		user = await this.dbService.getUserByEmail(email);
	
		if (!user)
		{
			// REGISER NEW USER WITH THIS OAUTH IDENTITY

			// Handle potential username collisions (GitHub username might already be used by someone else in our DB)
			let finalUsername = username.toLowerCase().trim();
			const existingByUsername = await this.dbService.getUserByUsername(finalUsername);
			if (existingByUsername)
				finalUsername = generateFallbackUsername(finalUsername);

			// If not found, we create a new user account and link the OAuth provider identity.
			user = await this.dbService.createOAuthUser({
				email,
				username: finalUsername,
				provider,
				providerId,
			});

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
