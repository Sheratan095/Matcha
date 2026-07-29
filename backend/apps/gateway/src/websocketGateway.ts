import { Logger } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { env } from '@repo/config';

const notificationSocketPath = '/socket.io';

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