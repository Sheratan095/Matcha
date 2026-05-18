import { Injectable, Logger, ForbiddenException, ConflictException, InternalServerErrorException, ClassSerializerInterceptor } from '@nestjs/common';
import { DbService } from './db/db.service';
import * as bcrypt from 'bcrypt';
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
		
		if (!user || !await this.comparePasswords(password, user.password_hash))
			throw new ForbiddenException('Invalid credentials');

		await this.issueTokens(user.id, res);

		return ({ message: 'Login successful', userId: user.id });
	}

	async register(email: string, username: string, password: string, res: any)
	{
		const passwordHash = await this.hashPassword(password);

		try
		{
			const newId: string = await this.dbService.createUser(email, username, passwordHash);

			await this.issueTokens(newId, res);

			return { message: 'User registered successfully', date: new Date(), userId: newId };
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

		await this.issueTokens(userId, res);

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

	getHealth(): string
	{
		return ('OK');
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
	private async issueTokens(userId: string, res: any)
	{
		// If valid, issue new tokens
		const tokens = await this.jwtHelper.generateTokens(userId);
		// Set the new tokens as cookies in the response
		this.jwtHelper.setTokensAsCookies(res, tokens);
		// Store the new refresh token in the database, replacing the old one
		await this.dbService.saveRefreshToken(userId, tokens.refresh_token);
	}
}
