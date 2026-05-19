import { Injectable, Logger, ForbiddenException, ConflictException, InternalServerErrorException, ClassSerializerInterceptor } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { DbService } from './db/db.service';
import * as bcrypt from 'bcrypt';
import { JwtHelper } from './utils/jwt';
import { sendEmailVerification } from './utils/notification';
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
		
		if (!user || !await this.comparePasswords(password, user.password_hash))
			throw new ForbiddenException('Invalid credentials');

		await this.issueJwtTokens(user.id, res);

		return ({ message: 'Login successful', userId: user.id });
	}

	async register(email: string, username: string, password: string, res: any)
	{
		const passwordHash = await this.hashPassword(password);

		try
		{
			// TO DO
			// const newId: string = await this.dbService.createUser(email, username, passwordHash);
			const newId = "1";

			// TOKENS ARE ISSUED AFTER EMAIL VERIFICATION AND THEN LOGIN, NOT DURING REGISTRATION
			// await this.issueJwtTokens(newId, res);

			this.logger.log(`User registered with email ${email} and username ${username}, assigned ID ${newId}`);

			const verificationToken = await this.issueVerificationToken(newId);
			// Fire-and-forget with error handling (don't block registration response)
			sendEmailVerification(email, verificationToken, this.httpService)
				.catch(error =>
				{
					this.logger.error('Failed to send verification email', error);
				});

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
		// TO DO
		// 1. Validate the token against the database (not implemented here, but should be done in a real application)
		// 2. If valid, mark the user's email as verified in the database
		// 3. Optionally, issue JWT tokens immediately upon verification or require the user to log in


	}

	async logout(res: any)
	{
		await this.jwtHelper.clearTokens(res);
		return ({ message: 'Logged out successfully' });
	}

	async refreshTokens(userId: string, refreshToken: string, res: any)
	{
		const storedToken = await this.dbService.getRefreshToken(userId);

		if (!storedToken || storedToken !== refreshToken)
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

	private async issueVerificationToken(userId: string): Promise<string>
	{
		// Generate a secure random token for email verification
		const token = randomBytes(env.EMAIL_VERIFICATION_TOKEN_LENGTH).toString('hex');
		// Set the token expiration
		const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_EXPIRATION_MS); // 24 hours from now
		// Store the token in the database associated with the user (not implemented here, but should be done in a real application)
		await this.dbService.saveVerificationToken(userId, token, expiresAt);

		return (token);
	}
}
