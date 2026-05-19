import { Injectable, Logger } from '@nestjs/common';
import { env } from '@repo/config';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import * as fs from 'fs';
import { getLanguagePack } from './languages';

export enum EmailType
{
	Verification = 'verification',
	PasswordReset = 'password_reset', // TODO
}

@Injectable()
export class MailerService
{
	private readonly logger = new Logger("MailerService");
	private transporter: nodemailer.Transporter;

	constructor()
	{
		this.transporter = nodemailer.createTransport({
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
			secure: false, // true for 465, false for 587
			auth: {
				user: env.SMTP_USER,
				pass: env.SMTP_PASS,
			},
		});
	}

	async sendVerificationEmail(to: string, token: string, language: string = 'en'): Promise<void>
	{
		try
		{
			const link = `${env.FRONTEND_URL}:${env.FRONTEND_PORT}/verify-email?token=${token}`;

			await this.sendOTPEmail(to, token, language, link);

			this.logger.log(`Verification email sent to ${to} : token ${token}`);
		}
		catch (error: unknown)
		{
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error sending verification email to ${to}: ${errorMessage}`);
			throw error;
		}
	}

	private async sendOTPEmail(to: string, otpCode: string, language: string = 'en', verificationLink?: string ): Promise<void>
	{
		// Get language pack for the specified language
		const langPack = getLanguagePack(language);

		// Generate HTML content using template and language pack
		let htmlContent: string;
		try
		{
			// Load the email template
			const templatePath = path.join(
				__dirname,
				'templates',
				'verification-template.html'
			);
			const htmlTemplate = fs.readFileSync(templatePath, 'utf8');

			// Generate security points HTML
			const securityPointsHtml = langPack.securityPoints
				.map((point) => `<li>${point}</li>`)
				.join('');

			// Replace all placeholders with language pack values and dynamic content
			htmlContent = htmlTemplate
				.replace(/{{LANGUAGE}}/g, language)
				.replace(/{{TITLE}}/g, langPack.title)
				.replace(/{{GREETING}}/g, langPack.greeting)
				.replace(/{{MESSAGE}}/g, langPack.message)
				.replace(/{{VERIFICATION_LINK}}/g, verificationLink || '#')
				.replace(/{{OTP_LABEL}}/g, langPack.otpLabel)
				.replace(/{{OTP_CODE}}/g, otpCode)
				.replace(/{{EXPIRY_TEXT}}/g, langPack.expiryText)
				.replace(/{{SECURITY_TITLE}}/g, langPack.securityTitle)
				.replace(/{{SECURITY_POINTS}}/g, securityPointsHtml)
				.replace(/{{FOOTER_MESSAGE}}/g, langPack.footerMessage)
				.replace(/{{FOOTER_TEXT}}/g, langPack.footerText);
		}
		catch (error: unknown)
		{
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error loading email template: ${errorMessage}`);
			throw error;
		}

		const mailOptions = {
			from: `"Matcha" <${env.SMTP_USER}>`,
			to,
			subject: langPack.subject,
			text: langPack.plainText.replace(/{{OTP_CODE}}/g, otpCode),
			html: htmlContent,
		};

		try
		{
			await this.transporter.sendMail(mailOptions);
		}
		catch (error: unknown)
		{
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error sending verification email: ${errorMessage}`);
			throw error;
		}
	}
}
