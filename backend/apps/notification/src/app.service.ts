import { Injectable, Logger } from '@nestjs/common';
import { SupportedLanguage, SupportedLanguages, NotificationType, IProfileView } from '@repo/shared-types';
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
		const payload: IProfileView =
		{
			viewerId,
			username:          await this.dbService.getUsernameById(viewerId),
			profilePictureUrl: await this.dbService.getProfilePictureUrl(viewerId),
		};

		const delivered = this.wsGateway.sendToUser(recipientId, NotificationType.PROFILE_VIEW, payload);

		return ({ delivered });
	}
}