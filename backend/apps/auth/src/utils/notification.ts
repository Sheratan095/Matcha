import { HttpService } from "@nestjs/axios";
import { env } from "@repo/config";

export async function sendEmailVerification(email: string, token: string, httpService: HttpService)
{
	// HttpService is already configured with internal-key header in app.module
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/email-verification`, 
		{
			email,
			token,
		}).toPromise();
	}
	catch (err)
	{
		// Log error but don't throw to avoid failing caller flows
		// You can replace this with your logger
		// eslint-disable-next-line no-console
		console.error('sendEmailVerification failed', err);
	}
}