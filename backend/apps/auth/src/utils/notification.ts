import axios from 'axios';
import { env } from "@repo/config";

export async function sendEmailVerification(email: string, token: string): Promise<void>
{
	//Add internal key to headers for authentication with the notification service
	axios.defaults.headers.common['x-internal-key'] = env.INTERNAL_KEY;
	try {
		await axios.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/email-verification`, 
		{
			email,
			token,
		});
	} catch (err) {
		// Log error but don't throw to avoid failing caller flows
		// You can replace this with your logger
		// eslint-disable-next-line no-console
		console.error('sendEmailVerification failed', err);
	}
}