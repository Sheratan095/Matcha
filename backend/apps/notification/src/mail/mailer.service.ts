import { Injectable, Logger } from '@nestjs/common';
import { verificationEmailTemplate } from './templates/verification.template';
import { env } from '@repo/config';

export enum EmailType
{
	Verification = 'verification.template.ts',
	PasswordReset = 'password_reset.template.ts', // TO DO
}

@Injectable()
export class MailerService
{
	private readonly logger = new Logger(MailerService.name);

	async sendVerificationEmail(to: string, token: string): Promise<void>
	{
		const link = `${env.FRONTEND_URL}:${env.FRONTEND_PORT}/verify-email?token=${token}`;

		const emailContent = this.getEmailContent(EmailType.Verification, link);

		await this.sendMail(to, 'Verify your email address', emailContent);

		this.logger.log(`Verification email sent to ${to}`); // Log the email sending event
	}

	private async sendMail(to: string, subject: string, emailContent: string): Promise<void>
	{
		// In a real application, you would use nodemailer, SendGrid, etc.
		// For now, we will simulate the sending process.
		console.log(subject); // Debugging: see the generated HTML
		console.log(emailContent); // Debugging: see the generated HTML

		// Simulate async operation
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve();
			}, 100);
		});
	}

	private getEmailContent(type: EmailType, link: string): string
	{
		switch (type)
		{
			case EmailType.Verification:
				return verificationEmailTemplate(link);
			// case EmailType.PasswordReset:
			// 	return this.getPasswordResetEmailContent(token);
			default:
				throw new Error('Unsupported email type');
		}
	}
}
