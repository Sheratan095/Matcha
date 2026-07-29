import { Logger } from '@nestjs/common';
import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websockets';
import { env } from '@repo/config';
import { Socket } from 'socket.io';
import { handleAnyEvent } from './switch.ws';

@WebSocketGateway({
	namespace: '/notification',
	cors: env.SECURE,
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect
{
	private readonly logger = new Logger(NotificationGateway.name);

	handleConnection(client: Socket): void
	{
		this.logger.log(`Client connected to notification websocket: ${client.id}`);

		// Listen for any event on the client and log it
		client.onAny((eventName: string, ...args: any[]) =>
		{
			handleAnyEvent(client, eventName, ...args);
		});
	}

	handleDisconnect(client: Socket): void
	{
		this.logger.log(`Client disconnected from notification websocket: ${client.id}`);
	}

}