import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DbService } from './db/db.service';
import { env } from "@repo/config";

// Services contain the core business logic like the db calls

// The @Injectable() decorator marks the AppService class as a provider that can be injected into other classes (like controllers) in the NestJS framework
// This allows for dependency injection, making it easier to manage and test the application's components.
@Injectable()
export class AppService
{
	private readonly logger = new Logger(AppService.name);

	constructor(
			private readonly dbService: DbService,
			private readonly jwtService: JwtService )
	{}

	async login(user: any)
	{
		// In a real application, you'd validate the user credentials against the database first
		const payload = { username: user.username, sub: user.userId };
		
		const [accessToken, refreshToken] = await Promise.all([
			this.jwtService.signAsync(payload, {
					secret: env.JWT_ACCESS_SECRET,
					expiresIn: env.JWT_ACCESS_EXPIRATION_MS,
			}),
			this.jwtService.signAsync(payload, {
					secret: env.JWT_REFRESH_SECRET,
					expiresIn: env.JWT_REFRESH_EXPIRATION_MS,
			}),
		]);

		// Here you would also typically hash the refresh token and save it to the database for this user
		// e.g., await this.dbService.query('UPDATE users SET hashed_rt = $1 WHERE id = $2', [hashedRt, user.userId]);

		return ({ access_token: accessToken, refresh_token: refreshToken, });
	}

	async refreshTokens(userId: number, username: string, refreshToken: string)
	{
		// In reality, verify the refresh token against the hashed token in your DB
		// const user = await this.dbService.query('SELECT * FROM users WHERE id = $1', [userId]);
		// if (!user || !user.hashed_rt || !await bcrypt.compare(refreshToken, user.hashed_rt)) throw new ForbiddenException('Access Denied');
		
		// If valid, issue new tokens
		return (this.login({ userId, username }));
	}

	getHealth(): string
	{
		return ('OK');
	}

	async testDbConnection(): Promise<string>
	{
		try
		{
				const res = await this.dbService.query('SELECT NOW()');
				this.logger.log(`Database connected successfully: ${res.rows[0].now}`);
				return ('Database connected successfully: ' + res.rows[0].now);
		}
		catch (error)
		{
				this.logger.error('Database connection failed', error);
				throw new Error('Database connection failed');
		}
	}

	async getUsers(): Promise<any[]>
	{
		try
		{
				const res = await this.dbService.query('SELECT * FROM users');
				this.logger.log(`Fetched ${res.rows.length} users from database.`);
				return (res.rows);
		}
		catch (error)
		{
				this.logger.error('Failed to fetch users', error);
				throw new Error('Failed to fetch users');
		}
	}
}
