import { Injectable, Logger, ForbiddenException, ConflictException, InternalServerErrorException, ClassSerializerInterceptor } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SupportedLanguage } from '@repo/shared-types';
import { DbService } from './db/db.service';
import * as bcrypt from 'bcrypt';
import { JwtHelper } from './utils/jwt';
import { issueJwtTokens, issueVerificationToken, issueForgotPasswordToken } from './utils/tokenIssuing';
import { User } from '@repo/shared-types';

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
		const user: User | undefined = await this.dbService.getUserByUsername(username);

		if (!user)
			throw new ForbiddenException('Invalid credentials');

		if (user.email_verified === false)
		{
			this.logger.warn(`Login attempt with unverified email for user ${username} (ID: ${user.id})`);
			await issueVerificationToken(user, this.dbService, this.httpService, this.logger);
			throw new ForbiddenException('Email not verified', 'EMAIL_NOT_VERIFIED');
		}

		if (!await this.comparePasswords(password, user.password_hash))
			throw new ForbiddenException('Invalid credentials');

		await issueJwtTokens(user, res, this.dbService, this.jwtHelper, this.httpService, this.logger);

		return ({ message: 'Login successful', userId: user.id });
	}

	async register(email: string, username: string, password: string, language: SupportedLanguage, firstName: string, lastName: string, res: any)
	{
		const passwordHash = await this.hashPassword(password);

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

		if (!user)
			throw new ForbiddenException('No user found with the provided email address');

		if (user.email_verified === false)
		{
			this.logger.warn(`Forgot password attempt with unverified email for user with email ${email} (ID: ${user.id})`);
			await issueVerificationToken(user, this.dbService, this.httpService, this.logger);
			throw new ForbiddenException('Email not verified', 'EMAIL_NOT_VERIFIED');
		}

		await issueForgotPasswordToken(user, this.dbService, this.httpService, this.logger);

		return ({ message: 'Forgot password process initiated' });
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

}
