import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';
import { ApiTags, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EmailVerificationDto, EmailVerificationResponseDto, ErrorDto } from './dto/email_verification.dto';
import { ForgotPasswordDto, ForgotPasswordResponseDto } from './dto/forgotPassword.dto';


// Specify that this class is a NestJS controller
@Controller()
@ApiTags('Notification')
// This guard is applied to the entire controller for internal communication.
@UseGuards(InternalKeyGuard)
export class AppController
{
	constructor(private readonly appService: AppService)
	{}

	@Get('health')
	getHealth(): string
	{
		return ('OK');
	}

	@Post('email-verification')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Send verification email - INTERNAL 🔒', description: 'Sends a verification email to the user with the provided token.' })
	@ApiBody({ type: EmailVerificationDto })
	@ApiResponse({ status: 200, type: EmailVerificationResponseDto, description: 'Verification email sent successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	sendVerificationEmail(@Body() req: EmailVerificationDto)
	{
		return (this.appService.sendVerificationEmail(req.email, req.token, req.language));
	}

	@Post('forgot-password')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Send forgot password email - INTERNAL 🔒', description: 'Sends a forgot password email to the user with the provided token.' })
	@ApiBody({ type: ForgotPasswordDto })
	@ApiResponse({ status: 200, type: ForgotPasswordResponseDto, description: 'Forgot password email sent successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	sendForgotPasswordEmail(@Body() req: ForgotPasswordDto)
	{
		return (this.appService.sendForgotPasswordEmail(req.email, req.token, req.language));
	}
}