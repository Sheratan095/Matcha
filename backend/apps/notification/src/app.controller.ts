import { Controller, Get, Post, Body, Param, Query, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthenticatedUserGuard, CurrentUser, InternalKeyGuard } from '@repo/utils';
import { ApiTags, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EmailVerificationDto, EmailVerificationResponseDto } from './dto/email/email_verification.dto';
import { ForgotPasswordDto, ForgotPasswordResponseDto, PasswordChangedDto } from './dto/email/forgotPassword.dto';
import { CloseWsConnectionsDto } from './dto/ws_endpoints.dto';
import { ProfileViewNotifyDto, ProfileViewNotifyResponseDto } from './dto/wsNotify/notifyView.dto';
import { ProfileLikeNotifyDto, ProfileLikeNotifyResponseDto } from './dto/wsNotify/notifyLike.dto';
import { ChatMessageDto, ChatMessageResponseDto } from './dto/chat/chatMessage.dto';
import { ChatHistoryResponseDto, ChatListResponseDto } from './dto/chat/chat.dto';
import { ErrorDto } from '@repo/shared-types';
import { EventNotifyDto, EventNotifyResponseDto } from './dto/wsNotify/notifyEvents.dto';

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

	@Post('internal/email-verification')
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

	@Post('internal/forgot-password')
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

	@Post('internal/password-changed')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Send password changed email - INTERNAL 🔒', description: 'Tells the user their password was just changed, with a link to reset it if they did not do it.' })
	@ApiBody({ type: PasswordChangedDto })
	@ApiResponse({ status: 200, type: ForgotPasswordResponseDto, description: 'Password changed email sent successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	sendPasswordChangedEmail(@Body() req: PasswordChangedDto)
	{
		return (this.appService.sendPasswordChangedEmail(req.email, req.language));
	}

	@Get('online')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get number of online users', description: 'Returns the number of active WebSocket connections to the notification service.' })
	@ApiResponse({ status: 200, description: 'Number of online users retrieved successfully' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	getOnlineUsers()
	{
		return (this.appService.getOnlineUsers());
	}

	@Post('internal/close-ws-connections')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Close WebSocket connections - INTERNAL 🔒', description: 'Closes all active WebSocket connections for the specified user.' })
	@ApiBody({ type: CloseWsConnectionsDto })
	@ApiResponse({ status: 200, description: 'WebSocket connections closed successfully' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	closeWsConnections(@Body() req: CloseWsConnectionsDto)
	{
		return (this.appService.closeWsConnections(req.userId));
	}

	@Get('internal/is-online/:userId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Check if user is online - INTERNAL 🔒', description: 'Checks if the specified user has any active WebSocket connections.' })
	@ApiResponse({ status: 200, description: 'User online status retrieved successfully' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'User not found' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async isUserOnline(@Param('userId') userId: string)
	{
		return ({ isOnline: await this.appService.isUserOnline(userId) });
	}

	@Post('internal/notify/profile-view')
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

	@Post('internal/notify/profile-like')
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

	@Post('internal/notify/profile-unlike')
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

	@Post('internal/notify/event-invite')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Notify an event invite - INTERNAL 🔒', description: "Pushes a 'event-invite' notification to the invited user over WebSocket (queued if they are offline)." })
	@ApiBody({ type: EventNotifyDto })
	@ApiResponse({ status: 200, type: EventNotifyResponseDto, description: 'Notification delivered or queued' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async notifyEventInvite(@Body() req: EventNotifyDto)
	{
		return ( await this.appService.notifyEventInvite(req.inviteeId, req.inviterId, req.eventId, req.title, req.startTime));
	}

	@Post('internal/notify/event-accept')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Notify an event accept - INTERNAL 🔒', description: "Pushes a 'event-accept' notification to the inviter over WebSocket (queued if they are offline)." })
	@ApiBody({ type: EventNotifyDto })
	@ApiResponse({ status: 200, type: EventNotifyResponseDto, description: 'Notification delivered or queued' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async notifyEventAccept(@Body() req: EventNotifyDto)
	{
		return ( await this.appService.notifyEventAccept(req.inviteeId, req.inviterId, req.eventId, req.title, req.startTime));
	}

	@Post('internal/notify/event-decline')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Notify an event decline - INTERNAL 🔒', description: "Pushes a 'event-decline' notification to the inviter over WebSocket (queued if they are offline)." })
	@ApiBody({ type: EventNotifyDto })
	@ApiResponse({ status: 200, type: EventNotifyResponseDto, description: 'Notification delivered or queued' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async notifyEventDecline(@Body() req: EventNotifyDto)
	{
		return ( await this.appService.notifyEventDecline(req.inviteeId, req.inviterId, req.eventId, req.title, req.startTime));
	}

	@Post('internal/notify/event-cancel')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Notify an event cancel - INTERNAL 🔒', description: "Pushes a 'event-cancel' notification to the user who did NOT cancel (the other side of actorId) over WebSocket (queued if they are offline)." })
	@ApiBody({ type: EventNotifyDto })
	@ApiResponse({ status: 200, type: EventNotifyResponseDto, description: 'Notification delivered or queued' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async notifyEventCancel(@Body() req: EventNotifyDto)
	{
		return ( await this.appService.notifyEventCancel(req.inviteeId, req.inviterId, req.actorId, req.eventId, req.title, req.startTime));
	}

	@Post('internal/notify/event-start')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Notify an event start - INTERNAL 🔒', description: "Pushes a 'event-start' notification to BOTH sides of an accepted event when it starts, each one told about the other. Live only: not queued for an offline user." })
	@ApiBody({ type: EventNotifyDto })
	@ApiResponse({ status: 200, type: EventNotifyResponseDto, description: 'Delivered to at least one live socket, or not (nothing is queued)' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async notifyEventStart(@Body() req: EventNotifyDto)
	{
		return ( await this.appService.notifyEventStart(req.inviteeId, req.inviterId, req.eventId, req.title, req.startTime));
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
	@ApiOperation({ summary: 'Get conversation history', description: 'Messages of the given chat, oldest first. Pure read (no read-marking) — pass ?after=<epoch ms> to get only messages newer than the client already has. The caller must be a participant.' })
	@ApiResponse({ status: 200, type: ChatHistoryResponseDto, description: 'Conversation history' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Invalid chat id' })
	@ApiResponse({ status: 403, type: ErrorDto, description: 'Not a participant of this chat' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getChatHistory(@Param('chatId', ParseUUIDPipe) chatId: string, @Query('after') after: string | undefined, @CurrentUser() userId: string)
	{
		const	afterMs = after !== undefined ? Number(after) : undefined;
		const	messages = await this.appService.getChatHistory(userId, chatId, Number.isFinite(afterMs) ? afterMs : undefined);

		return ({ messages });
	}

	@Post('chat/:chatId/seen')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Mark a chat as seen', description: "Marks the other participant's messages in the chat as read and notifies them (chat-seen). The caller must be a participant." })
	@ApiResponse({ status: 200, description: 'Chat marked as seen' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Invalid chat id' })
	@ApiResponse({ status: 403, type: ErrorDto, description: 'Not a participant of this chat' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async markChatSeen(@Param('chatId', ParseUUIDPipe) chatId: string, @CurrentUser() userId: string)
	{
		return (await this.appService.markChatSeen(userId, chatId));
	}
}