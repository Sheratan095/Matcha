import { Injectable, Logger } from '@nestjs/common';
import { MailerService, EmailType } from './mail/mailer.service';

@Injectable()
export class AppService
{
	private readonly logger = new Logger("NOTIFICATION AppService");

	constructor(private readonly mailerService: MailerService) {}


	async sendVerificationEmail(email: string, token: string)
	{
		await this.mailerService.sendVerificationEmail(email, token);

		return ('Sending verification email to ' + email + ' with token ' + token);
	}
}