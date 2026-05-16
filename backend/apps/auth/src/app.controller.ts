import { Controller, Get, Post, Request, Res, UseGuards, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';
import { ApiOperation, ApiQuery, ApiTags, ApiHeader, ApiCookieAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { Response } from 'express';
import { env } from "@repo/config";


// Specify that this class is a NestJS controller
@Controller()
// This guard is applied to the entire controller for internal communication.
@UseGuards(InternalKeyGuard)
export class AppController
{

	constructor(private readonly appService: AppService)
	{ }

	@Get('health')
	getHealth(): string
	{
		return (this.appService.getHealth());
	}

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
			secure: process.env.NODE_ENV === 'production', // Set secure flag ONLY in production
			sameSite: 'strict',
			maxAge: env.JWT_ACCESS_EXPIRATION_MS,
		});

		res.cookie('refresh_token', tokens.refresh_token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production', // Set secure flag ONLY in production
			sameSite: 'strict',
			maxAge: env.JWT_REFRESH_EXPIRATION_MS,
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
			secure: process.env.NODE_ENV === 'production', // Set secure flag ONLY in production
			sameSite: 'strict',
			maxAge: env.JWT_ACCESS_EXPIRATION_MS
		});

		res.cookie('refresh_token', tokens.refresh_token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production', // Set secure flag ONLY in production
			sameSite: 'strict',
			maxAge: env.JWT_REFRESH_EXPIRATION_MS
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


	@Get('validate')
	@UseGuards(JwtAuthGuard)
	@ApiCookieAuth('access_token')
	@ApiOperation({ summary: 'Validate access token', description: 'Endpoint intended to be called by the API Gateway to authorize incoming requests. Validates the JWT cookie and returns user context.' })
	validateToken(@Request() req: any)
	{
		return { valid: true, user: req.user };
	}
}
