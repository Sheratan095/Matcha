import { Controller, Get, Post, Request, Res, UseGuards, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';
import { ApiOperation, ApiQuery, ApiTags, ApiHeader, ApiCookieAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { RegisterDto, RegisterResponseDto, RegisterErrorDto } from './dto/register.dto';
import { LoginDto, LoginResponseDto, LoginErrorDto } from './dto/login.dto';
import { Response } from 'express';


// Specify that this class is a NestJS controller
@Controller()
@ApiTags('auth')
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

	@Post('register') // Endpoint
	@HttpCode(HttpStatus.OK) // Override default 201 status code for POST to 200 for consistency in API responses
	@ApiOperation({ summary: 'User registration', description: 'Registers a new user.' }) // Name and desc just for docs
	@ApiBody({ type: RegisterDto }) // Input validation is done here
	// List of possible responses for documentation
	@ApiResponse({ status: 200, type: RegisterResponseDto, description: 'User successfully registered' })
	@ApiResponse({ status: 409, type: RegisterErrorDto, description: 'User/Email already exists' })
	@ApiResponse({ status: 400, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	async register(@Body() req: RegisterDto)
	{
		await this.appService.register(req.email, req.username, req.password);

		return { message: 'User registered successfully' };
	}

	@Post('login')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Login and generate JWT', description: 'Sets HTTP-only cookies with JWT access and refresh tokens.' })
	@ApiBody({ type: LoginDto })
	@ApiResponse({ status: 200, type: LoginResponseDto, description: 'Successfully logged in, tokens set in cookies' })
	@ApiResponse({ status: 401, type: LoginErrorDto, description: 'Invalid credentials' })
	@ApiResponse({ status: 400, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	async login(@Body() req: LoginDto, @Res({ passthrough: true }) res: Response)
	{
		const username = req.username || 'testuser';
		const psw = req.password || 'testpassword';

		return await this.appService.login(username, psw, res);
	}

	@Post('refresh')
	@HttpCode(HttpStatus.OK)
	@ApiCookieAuth('refresh_token')
	@ApiOperation({ summary: 'Refresh JWT token', description: 'Uses refresh token cookie to generate and set new access and refresh cookies.' })
	@ApiResponse({ status: 200, type: LoginResponseDto })
	async refreshTokens(@Request() req: any, @Res({ passthrough: true }) res: Response)
	{
		const userId = req.user?.userId;
		const username = req.user?.username;
		const refreshToken = req.user?.refreshToken;

		return (await this.appService.refreshTokens(userId, username, refreshToken, res));
	}

	@Post('logout')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Logout', description: 'Clears the authentication cookies.' })
	@ApiResponse({ status: 200, type: RegisterResponseDto })
	async logout(@Res({ passthrough: true }) res: Response)
	{
		await this.appService.logout(res);

		return { message: 'Logged out successfully' };
	}

	@Get('validate')
	@ApiCookieAuth('access_token')
	@ApiOperation({ summary: 'Validate access token', description: 'Endpoint intended to be called by the API Gateway to authorize incoming requests. Validates the JWT cookie and returns user context.' })
	@ApiResponse({ status: 200, description: 'Validation result and user context' })
	validateToken(@Request() req: any)
	{
		return { valid: true, user: req.user };
	}
}
