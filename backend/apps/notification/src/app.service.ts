import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupportedLanguage, SupportedLanguages, NotificationType, StdPayload, MessagePayload, MessageStatus, ChatReadPayload } from '@repo/shared-types';
import { MailerService } from './mail/mailer.service';
import { WsGateway } from './websocket/gateway.ws';
import { DbService } from './db/db.service';

@Injectable()
export class AppService
{
	private readonly logger = new Logger("NOTIFICATION AppService");

	constructor(
		private readonly mailerService: MailerService,
		private readonly wsGateway: WsGateway,
		private readonly dbService: DbService,
	) {}


	async sendVerificationEmail(email: string, token: string, language: SupportedLanguage = SupportedLanguages.ENGLISH)
	{
		await this.mailerService.sendVerificationEmail(email, token, language);

		return ('Sending verification email to ' + email + ' with token ' + token);
	}

	async sendForgotPasswordEmail(email: string, token: string, language: SupportedLanguage = SupportedLanguages.ENGLISH)
	{
		await this.mailerService.sendForgotPasswordEmail(email, token, language);

		return ('Sending forgot password email to ' + email + ' with token ' + token);
	}

	async isUserOnline(userId: string): Promise<boolean>
	{
		return (this.wsGateway.isUserOnline(userId));
	}

	async getOnlineUsers()
	{
		return (this.wsGateway.count());
	}

	async closeWsConnections(userId: string)
	{
		// Close all WebSocket connections for the given user ID
		this.wsGateway.closeConnectionsForUser(userId);

		return (`Closed all WebSocket connections for user ID ${userId}`);
	}

	// Composes the profile-view payload and pushes it to the recipient's socket(s).
	// Returns { delivered: false } when the user was offline and it was queued instead.
	async notifyProfileView(recipientId: string, viewerId: string)
	{
		// REUSE the class used from /profile/viewers
		const payload: StdPayload =
		{
			userId: viewerId,
			username:          await this.dbService.getUsernameById(viewerId),
			profilePictureUrl: await this.dbService.getProfilePictureUrl(viewerId),
		};

		const delivered = await this.wsGateway.sendToUser(recipientId, NotificationType.PROFILE_VIEW, payload, true);

		return ({ delivered });
	}

	async notifyProfileLike(likedId: string, likerId: string, matched: boolean)
	{
		const payload: StdPayload =
		{
			userId: likerId,
			username:          await this.dbService.getUsernameById(likerId),
			profilePictureUrl: await this.dbService.getProfilePictureUrl(likerId),
		};

		const delivered = await this.wsGateway.sendToUser(likedId, NotificationType.PROFILE_LIKE, payload, true);

		this.logger.log('notifyProfileLike: sent notification to user ' + likedId + ' from liker ' + likerId);

		if (matched)
		{
			const matchPayloadToLiker: StdPayload =
			{
				userId:         likedId,
				username:          await this.dbService.getUsernameById(likedId),
				profilePictureUrl: await this.dbService.getProfilePictureUrl(likedId),
			};

			const matchPayloadToLiked: StdPayload =
			{
				userId:         likerId,
				username:          await this.dbService.getUsernameById(likerId),
				profilePictureUrl: await this.dbService.getProfilePictureUrl(likerId),
			};

			await this.wsGateway.sendToUser(likedId, NotificationType.MATCHED, matchPayloadToLiked, true);
			await this.wsGateway.sendToUser(likerId, NotificationType.MATCHED, matchPayloadToLiker, true);

			this.logger.log('notifyProfileLike: users ' + likedId + ' and ' + likerId + ' matched!');
		}

		return ({ delivered });
	}

	// readerId just opened the chat and read its messages: tell the OTHER participant (the sender)
	// so their sent messages flip to "read" live. The payload's userId is the reader (who saw it).
	async notifyChatSeen(chatId: string, readerId: string)
	{
		const otherId = await this.dbService.getOtherParticipant(chatId, readerId);

		if (otherId === null)
			return ({ delivered: false });

		const payload: ChatReadPayload = new ChatReadPayload({ chatId, userId: readerId });

		// CHAT_SEEN is ephemeral (store = false): not queued for an offline recipient, since on
		// reconnect their history fetch already reflects the read state in the DB.
		const delivered = await this.wsGateway.sendToUser(otherId, NotificationType.CHAT_SEEN, payload, false);

		this.logger.log('notifyChatSeen: told user ' + otherId + ' that ' + readerId + ' read chat ' + chatId);

		return ({ delivered });
	}

	// Just send the notification to both users if they were connected, and send the UNMATCHED event to both of them.
	async notifyProfileUnlike(unlikedId: string, unlikerId: string)
	{
		const payloadToUnliker: StdPayload =
		{
			userId:            unlikedId,
			username:          await this.dbService.getUsernameById(unlikedId),
			profilePictureUrl: await this.dbService.getProfilePictureUrl(unlikedId),
		};

		const payloadToUnliked: StdPayload =
		{
			userId:            unlikerId,
			username:          await this.dbService.getUsernameById(unlikerId),
			profilePictureUrl: await this.dbService.getProfilePictureUrl(unlikerId),
		};

		await this.wsGateway.sendToUser(unlikerId, NotificationType.UNMATCHED, payloadToUnliker, true);
		await this.wsGateway.sendToUser(unlikedId, NotificationType.UNMATCHED, payloadToUnliked, true);

		this.logger.log('notifyProfileUnlike: sent UNMATCHED notification to users ' + unlikerId + ' and ' + unlikedId);

	}

	async sendPrivateMessage(senderId: string, recipientId: string, content: string) : Promise<boolean>
	{
		if (senderId === recipientId)
			throw new BadRequestException('You cannot message yourself');

		// A chat row exists only for a matched pair (created on mutual like, deleted on unmatch /
		// block), so "no chat" == not allowed to message. ForbiddenException => 403.
		const chatId = await this.dbService.getChatId(senderId, recipientId);

		if (chatId === null)
		{
			this.logger.warn('sendPrivateMessage: no chat for users ' + senderId + ' and ' + recipientId + '. Message not sent.');
			throw new ForbiddenException('You can only message your matches');
		}

		const payload: MessagePayload = await this.dbService.storeMessage(chatId, senderId, content);

		const delivered = await this.wsGateway.sendToUser(recipientId, NotificationType.MESSAGE, payload, true);

		if (delivered === true)
			await this.dbService.updateMessageStatus(payload.messageId, MessageStatus.DELIVERED);

		this.logger.log('sendPrivateMessage: sent message from user ' + senderId + ' to user ' + recipientId);

		return (delivered);
	}

	// Conversation history between the caller and otherUserId, oldest first. Same eligibility gate
	// as sending (matches only; blocking dissolves the match, so it also covers blocks).
	// Pure read: returns the conversation (optionally only messages newer than `after`, epoch ms).
	// It has NO side effects — marking read is a separate call (markChatSeen) so fetching history
	// never mutates state or emits events. The caller must be a participant of the chat.
	async getChatHistory(userId: string, chatId: string, after?: number): Promise<MessagePayload[]>
	{
		if (await this.dbService.isChatParticipant(chatId, userId) === false)
			throw new ForbiddenException('You are not a participant of this chat');

		return (await this.dbService.getConversation(chatId, after));
	}

	// Marks the OTHER participant's messages in the chat as read and notifies them (so their ticks
	// flip to read live). The caller must be a participant.
	async markChatSeen(userId: string, chatId: string)
	{
		if (await this.dbService.isChatParticipant(chatId, userId) === false)
			throw new ForbiddenException('You are not a participant of this chat');

		await this.dbService.updateMessagesStatusByChat(chatId, userId, MessageStatus.READ);
		await this.notifyChatSeen(chatId, userId);

		this.logger.log('markChatSeen: user ' + userId + ' marked chat ' + chatId + ' as read');

		return ({ seen: true });
	}

	// Lists the caller's conversations (latest message per partner, newest first).
	async getChatList(userId: string)
	{
		this.logger.log('getChatList: user ' + userId + ' fetched their chat list');

		return (await this.dbService.getChatList(userId));
	}
}