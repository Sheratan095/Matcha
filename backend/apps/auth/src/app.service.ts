import { Injectable, Logger, ForbiddenException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { DbService } from './db/db.service';
import * as bcrypt from 'bcrypt';
import { env } from "@repo/config";
import { JwtHelper } from './jwt/jwt';


// Services contain the core business logic like the db calls

// The @Injectable() decorator marks the AppService class as a provider that can be injected into other classes (like controllers) in the NestJS framework
// This allows for dependency injection, making it easier to manage and test the application's components.
@Injectable()
export class AppService
{
	private readonly logger = new Logger(AppService.name);

	constructor(
			private readonly dbService: DbService,
			private readonly jwtHelper: JwtHelper )
	{}

	async login(username: string, password: string, res: any)
	{
		// Hash the password and compare with stored hash in DB, then fetch user details
		const user = await this.dbService.getUserByUsername(username);
		
		if (!user || !await bcrypt.compare(password, user.password_hash))
			throw new ForbiddenException('Invalid credentials');

		// Generate JWT access and refresh tokens for the authenticated user
		const tokens = await this.jwtHelper.generateTokens(user.id);
		// Set the generated tokens as HTTP-only cookies in the response
		this.jwtHelper.setTokensAsCookies(res, tokens);
		// Save the refresh token in the database for later verification
		this.dbService.saveRefreshToken(user.id, tokens.refresh_token);

		return { message: 'Login successful' };
	}

	async register(email: string, username: string, password: string, res: any)
	{
		const passwordHash = await bcrypt.hash(password, 10);

		try
		{
			const newId: string = await this.dbService.createUser(email, username, passwordHash);

			// Generate JWT access and refresh tokens for the authenticated user
			const tokens = await this.jwtHelper.generateTokens(newId);
			// Set the generated tokens as HTTP-only cookies in the response
			this.jwtHelper.setTokensAsCookies(res, tokens);
			// Save the refresh token in the database for later verification
			this.dbService.saveRefreshToken(newId, tokens.refresh_token);
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

		return { message: 'User registered successfully' };
	}

	async logout(res: any)
	{
		await this.jwtHelper.clearTokens(res);
		return { message: 'Logged out successfully' };
	}

	async refreshTokens(userId: string, username: string, refreshToken: string, res: any)
	{
		if (!userId || !refreshToken)
			throw new ForbiddenException('Invalid refresh token');

		const storedToken = await this.dbService.getRefreshToken(userId);

		if (!storedToken || storedToken !== refreshToken)
			throw new ForbiddenException('Invalid refresh token');

		// If valid, issue new tokens
		const tokens = await this.jwtHelper.generateTokens(userId);
		// Set the new tokens as cookies in the response
		this.jwtHelper.setTokensAsCookies(res, tokens);
		// Store the new refresh token in the database, replacing the old one
		this.dbService.saveRefreshToken(userId, tokens.refresh_token);
		
		return { message: 'Tokens refreshed' };
	}

	getHealth(): string
	{
		return ('OK');
	}
}
