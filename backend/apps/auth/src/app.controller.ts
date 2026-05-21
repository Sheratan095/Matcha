import { Controller, Get, Post, Request, Res, UseGuards, Body, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { Response } from 'express';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';
import { ApiOperation, ApiTags, ApiCookieAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { RegisterDto, RegisterResponseDto, RegisterErrorDto } from './dto/register.dto';
import { LoginDto, LoginResponseDto, LoginErrorDto } from './dto/login.dto';
import { RefreshResponseDto, RefreshErrorDto } from './dto/refresh.dto';
import { VerifyEmailDto, VerifyEmailResponseDto, VerifyEmailErrorDto } from './dto/verify_email.dto';
import { ForgotPasswordDto, ForgotPasswordResponseDto, ForgotPasswordErrorDto } from './dto/forgo_password.dto';

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
		return ('OK');
	}

	@Post('register') // Endpoint
	@HttpCode(HttpStatus.OK) // Override default 201 status code for POST to 200 for consistency in API responses
	@ApiOperation({ summary: 'User registration', description: 'Registers a new user.' }) // Name and desc just for docs
	@ApiBody({ type: RegisterDto })
	// List of possible responses for documentation
	@ApiResponse({ status: 200, type: RegisterResponseDto, description: 'User successfully registered' })
	@ApiResponse({ status: 409, type: RegisterErrorDto, description: 'User/Email already exists' })
	@ApiResponse({ status: 400, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	// @Res passthrough allows us to use the response object for setting cookies in the service layer
	// while still returning a standard response body from the controller method.
	async register(@Body() req: RegisterDto, @Res({ passthrough: true }) res: Response) // -> Input validation is done here
	{
		// TO DO add first and last name ? calling user service to handle that logic ? or just add to the db service ?
		return (await this.appService.register(req.email, req.username, req.password, req.language, req.firstName, req.lastName, res));
	}

	@Post('verify-email')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Verify user email', description: 'Verifies the user\'s email address using the provided token.' })
	@ApiBody({ type: VerifyEmailDto })
	@ApiResponse({ status: 200, type: VerifyEmailResponseDto, description: 'Email verified successfully' })
	@ApiResponse({ status: 400, type: VerifyEmailErrorDto, description: 'Invalid or expired verification token' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	async verifyEmail(@Body() req: VerifyEmailDto, @Res({ passthrough: true }) res: Response)
	{
		return (await this.appService.verifyEmail(req.token, res));
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
		return (await this.appService.login(req.username, req.password, res));
	}

	@Post('refresh')
	@HttpCode(HttpStatus.OK)
	@ApiCookieAuth('refresh_token')
	@ApiOperation({ summary: 'Refresh JWT token', description: 'Uses refresh token cookie to generate and set new access and refresh cookies.' })
	@ApiResponse({ status: 200, type: RefreshResponseDto, description: 'Tokens refreshed and cookies set' })
	@ApiResponse({ status: 403, type: RefreshErrorDto, description: 'Invalid or missing refresh token' })
	async refreshTokens(@Request() req: any, @Res({ passthrough: true }) res: Response)
	{
		return (await this.appService.refreshTokens(req.body.userId, req.cookies.refresh_token, res));
	}

	@Post('logout')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Logout', description: 'Clears the authentication cookies.' })
	@ApiResponse({ status: 200, type: RegisterResponseDto })
	async logout(@Res({ passthrough: true }) res: Response)
	{
		// TO DO close all ws connections?
		return (await this.appService.logout(res));
	}

	@Get('validate')
	@ApiCookieAuth('access_token')
	@ApiOperation({ summary: 'Validate access token', description: 'Endpoint intended to be called by the API Gateway to authorize incoming requests. Validates the JWT cookie and returns user context.' })
	@ApiResponse({ status: 200, description: 'Validation result and user context' })
	validateToken(@Request() req: any)
	{
		return (this.appService.validateToken(req.cookies.access_token));
	}

	@Post('forgot-password')
	@ApiOperation({ summary: 'Forgot password', description: 'Initiates the forgot password process (not implemented yet).' })
	@ApiResponse({ status: 200, type: ForgotPasswordResponseDto, description: 'Forgot password process initiated (placeholder)' })
	@ApiResponse({ status: 400, type: ForgotPasswordErrorDto, description: 'Invalid email address' })
	async forgotPassword(@Body() req: ForgotPasswordDto)
	{
		return (await this.appService.forgotPassword(req.email));
	}
}
