import { Injectable, Logger } from '@nestjs/common';
import { env, FRONTEND_BASE_URL } from '@repo/config';
import { SupportedLanguage, SupportedLanguages } from '@repo/shared-types';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import * as fs from 'fs';
import { getVerificationPack, getForgotPasswordPack, getPasswordChangedPack } from './languages';

export enum EmailType
{
	Verification = 'verification',
	PasswordReset = 'password_reset',
}

// HTML-escape a value destined for an email body/attribute. Covers the five characters that can
// break out of HTML text or a quoted attribute.
function escapeHtml(value: unknown): string
{
	return (String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)));
}

// Fills {{KEY}} placeholders in a template. Every value is HTML-ESCAPED BY DEFAULT, so any field
// (including anything user-derived added later) is safe to drop in without a second thought. Keys
// in `rawHtmlKeys` are inserted verbatim — use ONLY for values that are intentional, trusted HTML
// (e.g. a pre-built <li> list whose inner text was already escaped).
function renderTemplate(template: string, values: Record<string, unknown>, rawHtmlKeys: string[] = []): string
{
	let	out = template;

	for (const [key, value] of Object.entries(values))
	{
		const	replacement = rawHtmlKeys.includes(key) ? String(value ?? '') : escapeHtml(value);

		out = out.split(`{{${key}}}`).join(replacement);
	}

	return (out);
}

// The logo in the email header: a PNG of the cup mark (frontend/public/LOGO), attached inline and referenced
// by the templates as <img src="cid:matcha-logo">. Gmail and Outlook render neither inline SVG nor SVG
// images and block data: URIs, so a CID attachment is the form that works in every client.
const LOGO_ATTACHMENT =
{
	filename: 'matcha-logo.png',
	path: path.join(__dirname, 'assets', 'logo.png'),
	cid: 'matcha-logo',
	contentDisposition: 'inline' as const,
};

// The paper grain of the reset emails: the site's --tex-grain / --tex-grain-soft as 240px PNG tiles
// (assets/grain.png, assets/grain-soft.png), inlined as data: URIs into {{GRAIN_URI}} / {{GRAIN_SOFT_URI}}.
// It is decoration, so a client that drops data: URIs shows the flat paper colour every surface also sets.
// A missing asset must not stop the email: it falls back to a transparent pixel.
const NO_GRAIN = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
let grainCache: { GRAIN_URI: string; GRAIN_SOFT_URI: string } | undefined;

function grainValues(): { GRAIN_URI: string; GRAIN_SOFT_URI: string }
{
	if (!grainCache)
	{
		const	dataUri = (file: string): string =>
			`data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', file)).toString('base64')}`;

		try
		{
			grainCache = { GRAIN_URI: dataUri('grain.png'), GRAIN_SOFT_URI: dataUri('grain-soft.png') };
		}
		catch
		{
			grainCache = { GRAIN_URI: NO_GRAIN, GRAIN_SOFT_URI: NO_GRAIN };
		}
	}

	return (grainCache);
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

	async sendVerificationEmail(to: string, token: string, language: SupportedLanguage = SupportedLanguages.ENGLISH): Promise<void>
	{
		try
		{
			const link = `${FRONTEND_BASE_URL}/verify-email?token=${token}`;

			await this.sendVerificationEmailContent(to, token, language, link);

			this.logger.log(`Verification email sent to ${to} : token ${token}`);
		}
		catch (error: unknown)
		{
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error sending verification email to ${to}: ${errorMessage}`);
			throw error;
		}
	}

	private async sendVerificationEmailContent(to: string, otpCode: string, language: SupportedLanguage = SupportedLanguages.ENGLISH, verificationLink?: string): Promise<void>
	{
		// Get language pack for the specified language
		const langPack = getVerificationPack(language);

		// Minutes shown in the email; must mirror the token TTL set in the auth service.
		const expiryMinutes = String(Math.round(env.EMAIL_VERIFICATION_EXPIRATION_MS / 60000));

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

			// Security points are the one intentional-HTML value: a <li> list. Escape each point's
			// TEXT, then wrap in <li>, and pass it through as raw HTML below.
			const securityPointsHtml = langPack.securityPoints
				.map((point) => `<li>${escapeHtml(point)}</li>`)
				.join('');

			// Every value is HTML-escaped by renderTemplate (except SECURITY_POINTS, already-safe
			// markup) — so adding a user-derived placeholder here later is safe automatically.
			htmlContent = renderTemplate(htmlTemplate,
			{
				LANGUAGE:         language,
				TITLE:            langPack.title,
				GREETING:         langPack.greeting,
				MESSAGE:          langPack.message,
				VERIFICATION_LINK: verificationLink || '#',
				BUTTON_TEXT:      langPack.buttonText,
				OTP_LABEL:        langPack.otpLabel,
				OTP_CODE:         otpCode,
				EXPIRY_TEXT:      langPack.expiryText,
				SECURITY_TITLE:   langPack.securityTitle,
				SECURITY_POINTS:  securityPointsHtml,
				FOOTER_MESSAGE:   langPack.footerMessage,
				FOOTER_TEXT:      langPack.footerText,
				ALL_RIGHTS_RESERVED: langPack.allRightsReserved,
			}, ['SECURITY_POINTS']);

			// Resolve {{EXPIRY_MINUTES}} last: it lives inside langPack strings (expiryText,
			// securityPoints) that were just substituted into the HTML above. It is a number.
			htmlContent = htmlContent.split('{{EXPIRY_MINUTES}}').join(escapeHtml(expiryMinutes));
		}
		catch (error: unknown)
		{
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error loading verification email template: ${errorMessage}`);
			throw error;
		}

		const mailOptions = {
			from: `"Matcha" <${env.SMTP_USER}>`,
			to,
			subject: langPack.subject,
			text: langPack.plainText.replace(/{{OTP_CODE}}/g, otpCode).replace(/{{EXPIRY_MINUTES}}/g, expiryMinutes),
			html: htmlContent,
			attachments: [LOGO_ATTACHMENT],
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

	async sendForgotPasswordEmail(to: string, token: string, language: SupportedLanguage = SupportedLanguages.ENGLISH): Promise<void>
	{
		try
		{
			const link = `${FRONTEND_BASE_URL}/reset-password?token=${token}`;

			await this.sendForgotPasswordEmailContent(to, token, language, link);

			this.logger.log(`Forgot password email sent to ${to} : token ${token}`);
		}
		catch (error: unknown)
		{
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error sending forgot password email to ${to}: ${errorMessage}`);
			throw error;
		}
	}


	private async sendForgotPasswordEmailContent(to: string, resetCode: string, language: SupportedLanguage = SupportedLanguages.ENGLISH, resetLink?: string): Promise<void>
	{
		// Get language pack for the specified language
		const langPack = getForgotPasswordPack(language);

		// Minutes shown in the email; must mirror the token TTL set in the auth service.
		const expiryMinutes = String(Math.round(env.FORGOT_PASSWORD_EXPIRATION_MS / 60000));

		// Generate HTML content using template and language pack
		let htmlContent: string;
		try
		{
			// Load the email template
			const templatePath = path.join(
				__dirname,
				'templates',
				'forgot-password-template.html'
			);
			const htmlTemplate = fs.readFileSync(templatePath, 'utf8');

			// Security points are the one intentional-HTML value: a <li> list. Escape each point's
			// TEXT, then wrap in <li>, and pass it through as raw HTML below.
			const securityPointsHtml = langPack.securityPoints
				.map((point) => `<li>${escapeHtml(point)}</li>`)
				.join('');

			// Every value is HTML-escaped by renderTemplate (except SECURITY_POINTS, already-safe
			// markup) — so adding a user-derived placeholder here later is safe automatically.
			htmlContent = renderTemplate(htmlTemplate,
			{
				LANGUAGE:            language,
				TITLE:               langPack.title,
				GREETING:            langPack.greeting,
				MESSAGE:             langPack.message,
				ALERT_MESSAGE:       langPack.alertMessage,
				BUTTON_TEXT:         langPack.buttonText,
				RESET_LINK:          resetLink || '#',
				OTP_LABEL:           langPack.otpLabel,
				OTP_CODE:            resetCode,
				EXPIRY_TEXT:         langPack.expiryText,
				SECURITY_TITLE:      langPack.securityTitle,
				SECURITY_POINTS:     securityPointsHtml,
				FOOTER_MESSAGE:      langPack.footerMessage,
				FOOTER_TEXT:         langPack.footerText,
				ALL_RIGHTS_RESERVED: langPack.allRightsReserved,
				...grainValues(),
			}, ['SECURITY_POINTS']);

			// Resolve {{EXPIRY_MINUTES}} last: it lives inside langPack strings (expiryText,
			// securityPoints) that were just substituted into the HTML above. It is a number.
			htmlContent = htmlContent.split('{{EXPIRY_MINUTES}}').join(escapeHtml(expiryMinutes));
		}
		catch (error: unknown)
		{
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error loading forgot password email template: ${errorMessage}`);
			throw error;
		}

		const mailOptions = {
			from: `"Matcha" <${env.SMTP_USER}>`,
			to,
			subject: langPack.subject,
			text: langPack.plainText.replace(/{{OTP_CODE}}/g, resetCode).replace(/{{EXPIRY_MINUTES}}/g, expiryMinutes),
			html: htmlContent,
			attachments: [LOGO_ATTACHMENT],
		};

		try
		{
			await this.transporter.sendMail(mailOptions);
		}
		catch (error: unknown)
		{
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error sending forgot password email: ${errorMessage}`);
			throw error;
		}
	}

	// Sent after a successful password reset. Reuses the forgot-password template: same layout (alert
	// box, one button, a short note, security tips), only the texts differ. The button leads to
	// /forgot-password, so a user who did NOT make the change can take the account back right away.
	async sendPasswordChangedEmail(to: string, language: SupportedLanguage = SupportedLanguages.ENGLISH): Promise<void>
	{
		const	langPack = getPasswordChangedPack(language);
		const	resetLink = `${FRONTEND_BASE_URL}/forgot-password`;

		try
		{
			const	htmlTemplate = fs.readFileSync(path.join(__dirname, 'templates', 'forgot-password-template.html'), 'utf8');
			const	securityPointsHtml = langPack.securityPoints
				.map((point) => `<li>${escapeHtml(point)}</li>`)
				.join('');

			const	htmlContent = renderTemplate(htmlTemplate,
			{
				LANGUAGE:            language,
				TITLE:               langPack.title,
				GREETING:            langPack.greeting,
				MESSAGE:             langPack.message,
				ALERT_MESSAGE:       langPack.alertMessage,
				BUTTON_TEXT:         langPack.buttonText,
				RESET_LINK:          resetLink,
				// The template's expiry line carries the "if it was you, ignore this" note
				EXPIRY_TEXT:         langPack.noteText,
				SECURITY_TITLE:      langPack.securityTitle,
				SECURITY_POINTS:     securityPointsHtml,
				FOOTER_MESSAGE:      langPack.footerMessage,
				FOOTER_TEXT:         langPack.footerText,
				ALL_RIGHTS_RESERVED: langPack.allRightsReserved,
				...grainValues(),
			}, ['SECURITY_POINTS']);

			await this.transporter.sendMail({
				from: `"Matcha" <${env.SMTP_USER}>`,
				to,
				subject: langPack.subject,
				text: langPack.plainText.replace(/{{RESET_LINK}}/g, resetLink),
				html: htmlContent,
				attachments: [LOGO_ATTACHMENT],
			});

			this.logger.log(`Password changed email sent to ${to}`);
		}
		catch (error: unknown)
		{
			const	errorMessage = error instanceof Error ? error.message : String(error);

			this.logger.error(`Error sending password changed email to ${to}: ${errorMessage}`);
			throw (error);
		}
	}
}
