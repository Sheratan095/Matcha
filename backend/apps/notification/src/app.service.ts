import { Injectable, Logger } from '@nestjs/common';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';
import { MailerService } from './mail/mailer.service';

@Injectable()
export class AppService
{
	private readonly logger = new Logger("NOTIFICATION AppService");

	constructor(private readonly mailerService: MailerService) {}


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
}