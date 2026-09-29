import { Logger } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { env } from '@repo/config';
import axios from 'axios';

const notificationSocketPath = '/socket.io';

// Header used to hand the authenticated userId to the notification service.
// The gateway ALWAYS sets it from the validated token, so notification never
// trusts a client-supplied value.
export const USER_ID_HEADER = 'x-user-id';

// This function creates a proxy middleware for handling WebSocket connections to the notification service.
export function createNotificationSocketProxy(logger: Logger): any
{
	return (createProxyMiddleware({
		target: `${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`,
		changeOrigin: true,
		ws: true,
		on:
		{
			error: (err: Error, _req: IncomingMessage, _res: ServerResponse | Socket) =>
			{
				logger.error('Notification websocket proxy error:', err);
			},
		},
	}) as any);
}

// This function checks if a given URL corresponds to a notification WebSocket request.
export function isNotificationSocketRequest(url: string | undefined): boolean
{
	if (!url)
		return (false);

	return (url.startsWith(notificationSocketPath));
}

// Authenticate an incoming notification socket request by asking the AUTH service
// to validate the access_token cookie. Returns the userId on success, or null.
export async function authenticateNotificationSocket(req: IncomingMessage, logger: Logger): Promise<string | null>
{
	const cookieHeader = req.headers.cookie;

	// No cookies -> no access token to validate.
	if (!cookieHeader)
		return (null);

	try
	{
		// The auth controller is behind InternalKeyGuard, so the internal key is required.
		// The access_token itself travels in the forwarded Cookie header (auth reads req.cookies.access_token).
		const response = await axios.get(`${env.AUTH_HOST}:${env.AUTH_PORT}/validate`,
		{
			headers:
			{
				cookie: cookieHeader,
				'x-internal-key': env.INTERNAL_KEY,
			},
		});

		if (response.data?.valid && response.data.userId)
			return (String(response.data.userId));

		return (null);
	}
	catch (err)
	{
		logger.error('Notification websocket auth error:', err);

		return (null);
	}
}
