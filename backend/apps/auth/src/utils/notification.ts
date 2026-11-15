import { HttpService } from "@nestjs/axios";
import { env } from "@repo/config";
import { SupportedLanguage } from "@repo/shared-types";

export async function sendEmailVerification(email: string, token: string, language: SupportedLanguage, httpService: HttpService)
{
	// HttpService is already configured with internal-key header in app.module
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/internal/email-verification`, 
		{
			email,
			token,
			language
		}).toPromise();
	}
	catch (err)
	{
		// Rethrow error to allow caller (e.g. retry loop) to handle it
		// 	BUSINESS LOGIC IS HANDLED BY AUTH app.service
		throw err;
	}
}

// The "your password was changed" alert, sent after a successful reset. Unlike the two above there
// is nothing to retry: the caller fires it and only logs a failure.
export async function sendPasswordChangedEmail(email: string, language: SupportedLanguage, httpService: HttpService)
{
	// HttpService is already configured with internal-key header in app.module
	await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/internal/password-changed`,
	{
		email,
		language
	}).toPromise();
}

export async function sendForgotPasswordEmail(email: string, token: string, language: SupportedLanguage, httpService: HttpService)
{
	// HttpService is already configured with internal-key header in app.module
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/internal/forgot-password`, 
		{
			email,
			token,
			language
		}).toPromise();
	}
	catch (err)
	{
		// Rethrow error to allow caller (e.g. retry loop) to handle it
		// 	BUSINESS LOGIC IS HANDLED BY AUTH app.service
		throw err;
	}
}

export async function closeWsConnections(userId: string, httpService: HttpService)
{
	// HttpService is already configured with internal-key header in app.module
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/internal/close-ws-connections`, 
		{
			userId
		}).toPromise();
	}
	catch (err)
	{
		// Rethrow error to allow caller (e.g. retry loop) to handle it
		// 	BUSINESS LOGIC IS HANDLED BY AUTH app.service
		throw err;
	}
}