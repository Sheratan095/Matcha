import { Controller, Get, Post, Body, Param, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthenticatedUserGuard, CurrentUser, InternalKeyGuard } from '@repo/utils';
import { ApiTags, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EmailVerificationDto, EmailVerificationResponseDto, ErrorDto } from './dto/email_verification.dto';
import { ForgotPasswordDto, ForgotPasswordResponseDto } from './dto/forgotPassword.dto';
import { CloseWsConnectionsDto } from './dto/ws_endpoints.dto';
import { ProfileViewNotifyDto, ProfileViewNotifyResponseDto } from './dto/notifyView.dto';
import { ProfileLikeNotifyDto, ProfileLikeNotifyResponseDto } from './dto/notifyLike.dto';
import { ChatMessageDto, ChatMessageResponseDto } from './dto/chatMessage.dto';
import { ChatHistoryResponseDto, ChatListResponseDto } from './dto/chat.dto';

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

	@Get('online')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get number of online users - INTERNAL 🔒', description: 'Returns the number of active WebSocket connections to the notification service.' })
	@ApiResponse({ status: 200, description: 'Number of online users retrieved successfully' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	getOnlineUsers()
	{
		return (this.appService.getOnlineUsers());
	}

	@Post('close-ws-connections')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Close WebSocket connections - INTERNAL 🔒', description: 'Closes all active WebSocket connections for the specified user.' })
	@ApiBody({ type: CloseWsConnectionsDto })
	@ApiResponse({ status: 200, description: 'WebSocket connections closed successfully' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	closeWsConnections(@Body() req: CloseWsConnectionsDto)
	{
		return (this.appService.closeWsConnections(req.userId));
	}

	@Get('is-online/:userId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Check if user is online - INTERNAL 🔒', description: 'Checks if the specified user has any active WebSocket connections.' })
	@ApiResponse({ status: 200, description: 'User online status retrieved successfully' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'User not found' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async isUserOnline(@Param('userId') userId: string)
	{
		return ({ isOnline: await this.appService.isUserOnline(userId) });
	}

	@Post('notify/profile-view')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Notify a profile view - INTERNAL 🔒', description: "Pushes a 'profile-view' notification to the profile owner over WebSocket (queued if they are offline)." })
	@ApiBody({ type: ProfileViewNotifyDto })
	@ApiResponse({ status: 200, type: ProfileViewNotifyResponseDto, description: 'Notification delivered or queued' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async notifyProfileView(@Body() req: ProfileViewNotifyDto)
	{
		return ( await this.appService.notifyProfileView(req.recipientId, req.viewerId));
	}

	@Post('notify/profile-like')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Notify a profile like - INTERNAL 🔒', description: "Pushes a 'profile-like' notification to the liked user over WebSocket (queued if they are offline)." })
	@ApiBody({ type: ProfileLikeNotifyDto })
	@ApiResponse({ status: 200, type: ProfileLikeNotifyResponseDto, description: 'Notification delivered or queued' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async notifyProfileLike(@Body() req: ProfileLikeNotifyDto)
	{
		return ( await this.appService.notifyProfileLike(req.likedId, req.likerId, req.matched));
	}

	@Post('notify/profile-unlike')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Notify a profile like - INTERNAL 🔒', description: "Pushes a 'profile-like' notification to the liked user over WebSocket (queued if they are offline)." })
	@ApiBody({ type: ProfileLikeNotifyDto })
	@ApiResponse({ status: 200, type: ProfileLikeNotifyResponseDto, description: 'Notification delivered or queued' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async notifyProfileUnlike(@Body() req: ProfileLikeNotifyDto)
	{
		return ( await this.appService.notifyProfileUnlike(req.likedId, req.likerId));
	}

	@Post('chat/message')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Send a private message', description: "Send a private message to the specified user." })
	@ApiBody({ type: ChatMessageDto })
	@ApiResponse({ status: 200, type: ChatMessageResponseDto, description: 'Notification delivered or queued' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async notifyPrivateMessage(@Body() req: ChatMessageDto, @CurrentUser() userId: string)
	{
		return ( await this.appService.sendPrivateMessage(userId, req.toUserId, req.content));
	}

	@Get('chat')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List my chats', description: 'Returns the authenticated user\'s conversations, each with the other participant and a preview of the latest message, newest first.' })
	@ApiResponse({ status: 200, type: ChatListResponseDto, description: 'Conversation list' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getChatList(@CurrentUser() userId: string)
	{
		const chats = await this.appService.getChatList(userId);

		return ({ chats });
	}

	@Get('chat/:chatId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get conversation history', description: 'Returns the messages of the given chat, oldest first. The caller must be a participant of the chat.' })
	@ApiResponse({ status: 200, type: ChatHistoryResponseDto, description: 'Conversation history' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Invalid chat id' })
	@ApiResponse({ status: 403, type: ErrorDto, description: 'Not a participant of this chat' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getChatHistory(@Param('chatId', ParseUUIDPipe) chatId: string, @CurrentUser() userId: string)
	{
		const messages = await this.appService.getChatHistory(userId, chatId);

		return ({ messages });
	}
}