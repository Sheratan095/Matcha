import { Injectable, Logger, ForbiddenException, ConflictException, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SupportedLanguage } from '@repo/shared-types';
import { DbService } from './db/db.service';
import { JwtHelper } from './utils/jwt';
import { issueJwtTokens, issueVerificationToken, issueForgotPasswordToken } from './utils/tokenIssuing';
import { User } from '@repo/shared-types';
import { hashPassword, comparePasswords, loadCommonPasswords, validatePassword } from './utils/password';

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
		// Load common passwords into the centralized set in utils/password.ts
		await loadCommonPasswords('common-password.txt');
		this.logger.log('Common passwords initialization check completed.');
	}

	async login(username: string, password: string, res: any)
	{
		// Hash the password and compare with stored hash in DB, then fetch user details
		const user: User | undefined = await this.dbService.getUserByUsername(username);

		if (!user)
			throw new ForbiddenException('Invalid credentials');

		if (!await comparePasswords(password, user.password_hash))
			throw new ForbiddenException('Invalid credentials');

		if (user.email_verified === false)
		{
			this.logger.warn(`Login attempt with unverified email for user ${username} (ID: ${user.id})`);
			await issueVerificationToken(user, this.dbService, this.httpService, this.logger);
			throw new ForbiddenException('Email not verified', 'EMAIL_NOT_VERIFIED');
		}

		await issueJwtTokens(user, res, this.dbService, this.jwtHelper, this.httpService, this.logger);

		return ({ message: 'Login successful', userId: user.id });
	}

	async register(email: string, username: string, password: string, language: SupportedLanguage, firstName: string, lastName: string, res: any)
	{
		await validatePassword(password);
		const passwordHash = await hashPassword(password);

		// DON'T NEED IT BECAUSE THE NORMALIZATION IS DONE IN DTO
		// username = username.toLowerCase().trim();
		// email = email.toLowerCase().trim();

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

	async verifyEmail(tokenPlain: string, res: any)
	{
		const verificationTokenRecord = await this.dbService.getVerificationTokenRecord(tokenPlain);

		if (!verificationTokenRecord || new Date(verificationTokenRecord.expires_at) < new Date())
			throw new ForbiddenException('Invalid or expired verification token');

		await this.dbService.markUserEmailVerified(verificationTokenRecord.user_id);

		await this.dbService.deleteVerificationToken(verificationTokenRecord.user_id);

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

			return ({ valid: true, userId });
		}
		catch (error)
		{
			return ({ valid: false, userId: null });
		}
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

		this.logger.debug(`Password reset for user ID ${user.id} passed validation checks. Proceeding with password update.`);

		// Save and hash the new password, then invalidate the reset token
		const passwordHash = await hashPassword(password);
		await this.dbService.updateUserPassword(user.id, passwordHash);

		// Invalidate the reset token after successful password reset
		await this.dbService.deleteForgotPasswordToken(user.id);

		// Invalidate all existing tokens
		await this.jwtHelper.revokeTokens(null, this.dbService, user.id);

		return ({ message: 'Password reset successfully' });
	}
}
