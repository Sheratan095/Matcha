import { HttpService } from "@nestjs/axios";
import { env } from "@repo/config";
import { SupportedLanguage } from "@repo/shared-types";

export async function sendEmailVerification(email: string, token: string, language: SupportedLanguage, httpService: HttpService)
{
	// HttpService is already configured with internal-key header in app.module
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/email-verification`, 
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