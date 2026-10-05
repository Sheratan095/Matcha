import { HttpService } from "@nestjs/axios";
import { env } from "@repo/config";

// Tells the notification service to push a 'profile-view' notification to the profile owner.
// Mirrors apps/auth/src/utils/notification.ts: HttpService is already configured with the
// internal-key header in app.module. Rethrows so the caller decides whether to swallow the error.
export async function sendProfileViewNotification(recipientId: string, viewerId: string, httpService: HttpService)
{
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/notify/profile-view`,
		{
			recipientId,
			viewerId,
		}).toPromise();
	}
	catch (err)
	{
		// Rethrow: the caller (profile app.service) keeps this non-blocking and just warns.
		throw err;
	}
}
