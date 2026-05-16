import { Controller, Get, Post, Request, Res, UseGuards, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';
import { ApiOperation, ApiQuery, ApiTags, ApiHeader, ApiCookieAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { Response } from 'express';

// Specify that this class is a NestJS controller
@Controller()
// This guard is applied to the entire controller for internal communication.
@UseGuards(InternalKeyGuard)
export class AppController
{

	constructor(private readonly appService: AppService)
	{ }

	@Post('login')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Login and generate JWT', description: 'Sets HTTP-only cookies with JWT access and refresh tokens.' })
	async login(@Body() req: any, @Res({ passthrough: true }) res: Response)
	{
		// Note: Normally you would use a Local Auth Guard to validate credentials before issuing a token
		// Mock user for testing authentication flow
		const mockUser = {
			userId: 1,
			username: req.username || 'testuser',
		};
		const tokens = await this.appService.login(mockUser);
		
		// Set HTTP-only cookies
		res.cookie('access_token', tokens.access_token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 15 * 60 * 1000, // 15 minutes
		});

		res.cookie('refresh_token', tokens.refresh_token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		});

		return { message: 'Tokens generated and set as cookies successfully' };
	}

	@Post('refresh')
	@UseGuards(JwtRefreshAuthGuard)
	@HttpCode(HttpStatus.OK)
	@ApiCookieAuth('refresh_token')
	@ApiOperation({ summary: 'Refresh JWT token', description: 'Uses refresh token cookie to generate and set new access and refresh cookies.' })
	async refreshTokens(@Request() req: any, @Res({ passthrough: true }) res: Response)
	{
		const userId = req.user.userId;
		const username = req.user.username;
		const refreshToken = req.user.refreshToken;
		const tokens = await this.appService.refreshTokens(userId, username, refreshToken);

		res.cookie('access_token', tokens.access_token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 15 * 60 * 1000, // 15 minutes
		});

		res.cookie('refresh_token', tokens.refresh_token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		});

		return { message: 'Tokens refreshed' };
	}

	@Post('logout')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Logout', description: 'Clears the authentication cookies.' })
	async logout(@Res({ passthrough: true }) res: Response)
	{
		res.clearCookie('access_token');
		res.clearCookie('refresh_token');
		return { message: 'Logged out successfully' };
	}

	@Get('profile')
	@UseGuards(JwtAuthGuard)
	@ApiCookieAuth('access_token')
	@ApiOperation({ summary: 'Protected profile route', description: 'This route is protected by JwtAuthGuard and reads HTTP-only cookie.' })
	getProfile(@Request() req: any)
	{
		// Returns user details from the JWT payload
		return (req.user);
	}

	@Get('health')
	getHealth(): string
	{
		return (this.appService.getHealth());
	}

	@Get('test')
	// ApiOperation is used to provide metadata for swagger documentation
	@ApiOperation({ summary: 'Test endpoint', description: 'Returns a test message. Accepts an optional *content* query parameter.' })
	// ApiQuery is used to document the query parameters for this endpoint in swagger
	@ApiQuery({ name: 'content', required: false, description: 'Optional content string to include in the response' })
	test(@Query('content') content?: string): string
	{
		return (content ? `This is a test endpoint: ${content}` : 'This is a test endpoint');
	}

	@Get('db-test')
	@ApiOperation({ summary: 'Test database connection', description: 'Returns current timestamp from the database.' })
	async testDb(): Promise<string>
	{
		return (this.appService.testDbConnection());
	}

	@Get('users')
	@ApiOperation({ summary: 'Get all users', description: 'Returns all users to test migrations and seeding.' })
	async getUsers(): Promise<any[]>
	{
		return (this.appService.getUsers());
	}
}
