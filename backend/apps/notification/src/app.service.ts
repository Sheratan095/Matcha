import { Injectable, Logger } from '@nestjs/common';
import { MailerService, EmailType } from './mail/mailer.service';

@Injectable()
export class AppService
{
	private readonly logger = new Logger("NOTIFICATION AppService");

	constructor(private readonly mailerService: MailerService) {}

	// user clicks email link
	//   ↓
	// frontend route opens
	//   ↓
	// frontend extracts token
	//   ↓
	// frontend calls backend
	//   ↓
	// backend verifies token
	//   ↓
	// frontend shows success/error page
	//   ↓
	// fronend redirects to login page
	async sendVerificationEmail(email: string, token: string)
	{
		await this.mailerService.sendVerificationEmail(email, token);

		return ('Sending verification email to ' + email + ' with token ' + token);
	}
}