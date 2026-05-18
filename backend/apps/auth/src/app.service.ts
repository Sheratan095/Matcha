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

		const tokens = await this.jwtHelper.generateTokens({ userId: user.id, username: user.username });
		this.jwtHelper.setTokensAsCookies(res, tokens);

		// Here you would also typically hash the refresh token and save it to the database for this user TODO
		// e.g., await this.dbService.query('UPDATE users SET hashed_rt = $1 WHERE id = $2', [hashedRt, user.userId]);
		
		return { message: 'Login successful' };
	}

	async register(email: string, username: string, password: string)
	{
		const passwordHash = await bcrypt.hash(password, 10);

		try
		{
			await this.dbService.createUser(email, username, passwordHash);
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

	async refreshTokens(userId: number, username: string, refreshToken: string, res: any)
	{
		// In reality, verify the refresh token against the hashed token in your DB
		// const user = await this.dbService.query('SELECT * FROM users WHERE id = $1', [userId]);
		// if (!user || !user.hashed_rt || !await bcrypt.compare(refreshToken, user.hashed_rt)) throw new ForbiddenException('Access Denied');
		
		// If valid, issue new tokens
		const tokens = await this.jwtHelper.generateTokens({ userId, username });
		this.jwtHelper.setTokensAsCookies(res, tokens);
		
		return { message: 'Tokens refreshed' };
	}

	getHealth(): string
	{
		return ('OK');
	}
}
