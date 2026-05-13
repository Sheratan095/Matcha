import { Injectable, Logger } from '@nestjs/common';
import { DbService } from './db/db.service';

// Services contain the core business logic like the db calls

// The @Injectable() decorator marks the AppService class as a provider that can be injected into other classes (like controllers) in the NestJS framework
// This allows for dependency injection, making it easier to manage and test the application's components.
@Injectable()
export class AppService
{
	private readonly logger = new Logger(AppService.name);

	constructor(private readonly dbService: DbService) {}

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
