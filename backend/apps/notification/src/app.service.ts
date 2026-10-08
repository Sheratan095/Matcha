import { Injectable, Logger } from '@nestjs/common';
import { SupportedLanguage, SupportedLanguages, NotificationType, StdPayload } from '@repo/shared-types';
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

		const delivered = this.wsGateway.sendToUser(recipientId, NotificationType.PROFILE_VIEW, payload);

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

		const delivered = this.wsGateway.sendToUser(likedId, NotificationType.PROFILE_LIKE, payload);

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

			this.wsGateway.sendToUser(likedId, NotificationType.MATCHED, matchPayloadToLiked);
			this.wsGateway.sendToUser(likerId, NotificationType.MATCHED, matchPayloadToLiker);

			this.logger.log('notifyProfileLike: users ' + likedId + ' and ' + likerId + ' matched!');
		}

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

		this.wsGateway.sendToUser(unlikerId, NotificationType.UNMATCHED, payloadToUnliker);
		this.wsGateway.sendToUser(unlikedId, NotificationType.UNMATCHED, payloadToUnliked);

		this.logger.log('notifyProfileUnlike: sent UNMATCHED notification to users ' + unlikerId + ' and ' + unlikedId);

	}
}