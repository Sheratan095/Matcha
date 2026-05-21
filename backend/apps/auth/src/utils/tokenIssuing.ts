// Centralized method to issue new tokens, set cookies, and store refresh token in DB

import { SupportedLanguages, SupportedLanguage } from "@repo/shared-types/dist/languages";
import { randomBytes } from 'crypto';
import { env } from "@repo/config";
import { DbService } from "../db/db.service";
import { Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios/dist/http.service";
import { sendEmailVerification, sendForgotPasswordEmail } from "./notification";
import { JwtHelper } from "./jwt";
import { User } from "@repo/shared-types";

// This is called both during login/registration and token refresh to avoid code duplication
export async function issueJwtTokens(user: User, res: any, dbService: DbService, jwtHelper: JwtHelper, httpService: HttpService, logger: Logger)
{
	// If valid, issue new tokens
	const tokens = await jwtHelper.generateTokens(user.id);
	// Set the new tokens as cookies in the response
	jwtHelper.setTokensAsCookies(res, tokens);
	// Store the new refresh token in the database, replacing the old one
	await dbService.saveRefreshToken(user.id, tokens.refresh_token, tokens.refresh_token_expires_at);
}

export async function issueVerificationToken(user: User, dbService: DbService, httpService: HttpService, logger: Logger)
{
	// Generate a secure random token for email verification
	const token = randomBytes(env.EMAIL_VERIFICATION_TOKEN_LENGTH).toString('hex');
	// Set the token expiration
	const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_EXPIRATION_MS); // 24 hours from now
	// Store the token in the database associated with the user (not implemented here, but should be done in a real application)
	await dbService.saveVerificationToken(user.id, token, expiresAt);

	let sent: boolean = false;
	let attempts: number = 0;

	while (!sent && attempts < env.EMAIL_VERIFICATION_MAX_ATTEMPTS)
	{
		attempts++;
		try
		{
			await sendEmailVerification(user.email, token, user.language, httpService);
			sent = true;
		}
		catch (error)
		{
			logger.warn(`Failed to send verification email (attempt ${attempts})`, error);
		}
	}

	if (!sent)
		logger.error(`Failed to send verification email after ${attempts} attempts for user ID ${user.id} and email ${user.email}`);
}

export async function issueForgotPasswordToken(user: User, dbService: DbService, httpService: HttpService, logger: Logger)
{
	// Generate a secure random token for forgot password
	const token = randomBytes(env.FORGOT_PASSWORD_TOKEN_LENGTH).toString('hex');
	// Set the token expiration
	const expiresAt = new Date(Date.now() + env.FORGOT_PASSWORD_EXPIRATION_MS); // 1 hour from now
	// Store the token in the database associated with the user (not implemented here, but should be done in a real application)
	await dbService.saveForgotPasswordToken(user.id, token, expiresAt);

	let sent: boolean = false;
	let attempts: number = 0;

	while (!sent && attempts < env.FORGOT_PASSWORD_MAX_ATTEMPTS)
	{
		attempts++;
		try
		{
			await sendForgotPasswordEmail(user.email, token, user.language, httpService);
			sent = true;
		}
		catch (error)
		{
			logger.warn(`Failed to send forgot password email (attempt ${attempts})`, error);
		}
	}

	if (!sent)
		logger.error(`Failed to send forgot password email after ${attempts} attempts for email ${user.email}`);
}
