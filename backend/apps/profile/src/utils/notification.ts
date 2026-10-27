import { HttpService } from "@nestjs/axios";
import { env } from "@repo/config";
import { NotificationType } from "@repo/shared-types";

// Tells the notification service to push a 'profile-view' notification to the profile owner.
// Mirrors apps/auth/src/utils/notification.ts: HttpService is already configured with the
// internal-key header in app.module. Rethrows so the caller decides whether to swallow the error.
export async function sendProfileViewNotification(recipientId: string, viewerId: string, httpService: HttpService)
{
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/internal/notify/profile-view`,
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

export async function checkIsUserOnline(userId: string, httpService: HttpService): Promise<boolean>
{
	try
	{
		const response = await httpService.get(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/internal/is-online/${userId}`).toPromise();

		return (response.data.isOnline);
	}
	catch (err)
	{
		// Rethrow: the caller (profile app.service) keeps this non-blocking and just warns.
		throw err;
	}
}

export async function sendProfileLikeNotification(likedId: string, likerId: string, matched: boolean, httpService: HttpService)
{
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/internal/notify/profile-like`,
		{
			likedId,
			likerId,
			matched,
		}).toPromise();
	}
	catch (err)
	{
		// Rethrow: the caller (profile app.service) keeps this non-blocking and just warns.
		throw err;
	}
}

export async function sendProfileUnlikeNotification(likedId: string, likerId: string, httpService: HttpService)
{
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/internal/notify/profile-unlike`,
		{
			likedId,
			likerId,
		}).toPromise();
	}
	catch (err)
	{
		// Rethrow: the caller (profile app.service) keeps this non-blocking and just warns.
		throw err;
	}
}

// actorId is who performed the action; the notification service uses it for event-cancel,
// where either side can act and the other one is notified.
export async function sendEventNotification(inviteeId: string, inviterId: string, actorId: string, eventId: string, title: string, startTime: string, httpService: HttpService, type: NotificationType)
{
	try
	{
		await httpService.post(`${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}/internal/notify/${type}`,
		{
			inviteeId,
			inviterId,
			actorId,
			eventId,
			title,
			startTime,
		}).toPromise();
	}
	catch (err)
	{
		// Rethrow: the caller (profile app.service) keeps this non-blocking and just warns.
		throw err;
	}
}
