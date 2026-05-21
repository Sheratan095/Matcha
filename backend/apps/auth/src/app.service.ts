import { Injectable, Logger, ForbiddenException, ConflictException, InternalServerErrorException, ClassSerializerInterceptor } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';
import { DbService } from './db/db.service';
import * as bcrypt from 'bcrypt';
import { JwtHelper } from './utils/jwt';
import { sendEmailVerification, sendForgotPasswordEmail } from './utils/notification';
import { randomBytes } from 'crypto';
import { env } from '@repo/config';
import { eventNames } from 'process';


// Services contain the core business logic like the db calls

// The @Injectable() decorator marks the AppService class as a provider that can be injected into other classes (like controllers) in the NestJS framework
// This allows for dependency injection, making it easier to manage and test the application's components.
@Injectable()
export class AppService
{
	private readonly logger = new Logger("AUTH AppService");

	constructor(
			private readonly dbService: DbService,
			private readonly jwtHelper: JwtHelper,
			private readonly httpService: HttpService )
	{}

	async login(username: string, password: string, res: any)
	{
		// Hash the password and compare with stored hash in DB, then fetch user details
		const user = await this.dbService.getUserByUsername(username);

		if (!user)
			throw new ForbiddenException('Invalid credentials');

		if (user.email_verified === false)
		{
			this.logger.warn(`Login attempt with unverified email for user ${username} (ID: ${user.id})`);
			this.issueVerificationToken(user.id, user.email, user.language as SupportedLanguage);
			throw new ForbiddenException('Email not verified', 'EMAIL_NOT_VERIFIED');
		}

		if (!await this.comparePasswords(password, user.password_hash))
			throw new ForbiddenException('Invalid credentials');

		await this.issueJwtTokens(user.id, res);

		return ({ message: 'Login successful', userId: user.id });
	}

	async register(email: string, username: string, password: string, language: SupportedLanguage, firstName: string, lastName: string, res: any)
	{
		const passwordHash = await this.hashPassword(password);

		// Don't need it because the normalization is done in DTO
		// username = username.toLowerCase().trim();
		// email = email.toLowerCase().trim();

		try
		{
			const newId: string = await this.dbService.createUser(email, username, passwordHash, language, firstName, lastName);

			// TOKENS ARE ISSUED AFTER EMAIL VERIFICATION AND THEN LOGIN, NOT DURING REGISTRATION
			// await this.issueJwtTokens(newId, res);

			this.logger.log(`User registered with email ${email} and username ${username}, assigned ID ${newId}`);

			await this.issueVerificationToken(newId, email, language);

			return { message: 'Email verification required', date: new Date(), userId: newId };
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

	async verifyEmail(token: string, res: any)
	{
		const verificationToken = await this.dbService.getVerificationToken(token);

		if (!verificationToken || new Date(verificationToken.expires_at) < new Date())
			throw new ForbiddenException('Invalid or expired verification token');

		await this.dbService.markUserEmailVerified(verificationToken.user_id);

		return ({ message: 'Email verified successfully', userId: verificationToken.user_id });
	}

	async logout(res: any)
	{
		await this.jwtHelper.clearTokens(res);
		return ({ message: 'Logged out successfully' });
	}

	async refreshTokens(userId: string, refreshToken: string, res: any)
	{
		const storedToken = await this.dbService.getRefreshToken(userId);

		if (!storedToken || storedToken !== refreshToken || storedToken.expires_at < new Date())
			throw new ForbiddenException('Invalid refresh token');

		await this.issueJwtTokens(userId, res);

		return ({ message: 'Tokens refreshed', userId });
	}

	async validateToken(token: string)
	{
		try
		{
			const userId = await this.jwtHelper.validateAccessToken(token);

			return ({ valid: true, userId });
		}
		catch (error)
		{
			return ({ valid: false, userId: null });
		}
	}

	async forgotPassword(email: string)
	{
		const user = await this.dbService.getUserByEmail(email);
	
		if (!user)
			throw new ForbiddenException('No user found with the provided email address');

		if (user.email_verified === false)
		{
			this.logger.warn(`Forgot password attempt with unverified email for user with email ${email} (ID: ${user.id})`);
			this.issueVerificationToken(user.id, user.email, user.language as SupportedLanguage);
			throw new ForbiddenException('Email not verified', 'EMAIL_NOT_VERIFIED');
		}
	}

	// Helper methods used just by this class
	private async hashPassword(password: string): Promise<string>
	{
		const saltRounds = 10;
		return (await bcrypt.hash(password, saltRounds));
	}

	private async comparePasswords(password: string, hash: string): Promise<boolean>
	{
		return (await bcrypt.compare(password, hash));
	}

	// Centralized method to issue new tokens, set cookies, and store refresh token in DB
	// This is called both during login/registration and token refresh to avoid code duplication
	private async issueJwtTokens(userId: string, res: any)
	{
		// If valid, issue new tokens
		const tokens = await this.jwtHelper.generateTokens(userId);
		// Set the new tokens as cookies in the response
		this.jwtHelper.setTokensAsCookies(res, tokens);
		// Store the new refresh token in the database, replacing the old one
		await this.dbService.saveRefreshToken(userId, tokens.refresh_token, tokens.refresh_token_expires_at);
	}

	private async issueVerificationToken(userId: string, email: string, language: SupportedLanguage = SupportedLanguages.ENGLISH)
	{
		// Generate a secure random token for email verification
		const token = randomBytes(env.EMAIL_VERIFICATION_TOKEN_LENGTH).toString('hex');
		// Set the token expiration
		const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_EXPIRATION_MS); // 24 hours from now
		// Store the token in the database associated with the user (not implemented here, but should be done in a real application)
		await this.dbService.saveVerificationToken(userId, token, expiresAt);

		let sent: boolean = false;
		let attempts: number = 0;

		while (!sent && attempts < env.EMAIL_VERIFICATION_MAX_ATTEMPTS)
		{
			attempts++;
			try
			{
				await sendEmailVerification(email, token, language, this.httpService);
				sent = true;
			}
			catch (error)
			{
				this.logger.warn(`Failed to send verification email (attempt ${attempts})`, error);
			}
		}

		if (!sent)
			this.logger.error(`Failed to send verification email after ${attempts} attempts for user ID ${userId} and email ${email}`);
	}

	private async issueForgotPasswordToken(email: string, language: SupportedLanguage = SupportedLanguages.ENGLISH)
	{
		// Generate a secure random token for forgot password
		const token = randomBytes(env.FORGOT_PASSWORD_TOKEN_LENGTH).toString('hex');
		// Set the token expiration
		const expiresAt = new Date(Date.now() + env.FORGOT_PASSWORD_EXPIRATION_MS); // 1 hour from now
		// Store the token in the database associated with the user (not implemented here, but should be done in a real application)
		await this.dbService.saveForgotPasswordToken(email, token, expiresAt);

		let sent: boolean = false;
		let attempts: number = 0;

		while (!sent && attempts < env.FORGOT_PASSWORD_MAX_ATTEMPTS)
		{
			attempts++;
			try
			{
				await sendForgotPasswordEmail(email, token, language, this.httpService);
				sent = true;
			}
			catch (error)
			{
				this.logger.warn(`Failed to send forgot password email (attempt ${attempts})`, error);
			}
		}

		if (!sent)
			this.logger.error(`Failed to send forgot password email after ${attempts} attempts for email ${email}`);
	}
}
