import { Logger } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { env } from '@repo/config';
import { proxyErrorHandler } from './proxyErrors';

const notificationSocketPath = '/socket.io';

// This function creates a proxy middleware for handling WebSocket connections to the notification service.
export function createNotificationSocketProxy(logger: Logger): any
{
	return (createProxyMiddleware({
		target: `${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`,
		changeOrigin: true,
		// NO "ws: true": it makes the library subscribe its own 'upgrade' listener, which would
		// proxy upgrades without authentication. Upgrades are handled (and authenticated)
		// exclusively by the manual 'upgrade' handler in main.ts.
		on:
		{
			// The notification service only accepts sockets carrying the internal key, so a client
			// that reaches its port directly can't claim any x-user-id. proxyReq covers the
			// long-polling transport, proxyReqWs the websocket upgrade.
			proxyReq: (proxyReq) =>
			{
				if (env.INTERNAL_KEY)
					proxyReq.setHeader('x-internal-key', env.INTERNAL_KEY);
			},
			proxyReqWs: (proxyReq) =>
			{
				if (env.INTERNAL_KEY)
					proxyReq.setHeader('x-internal-key', env.INTERNAL_KEY);
			},
			// Answers a polling request with a 502 / 504 and destroys a failed upgrade's socket.
			// No proxyTimeout here: long-polling requests are held open on purpose.
			error: proxyErrorHandler(logger, 'notification'),
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
