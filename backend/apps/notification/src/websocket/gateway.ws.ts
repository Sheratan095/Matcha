import { Logger } from '@nestjs/common';
import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websockets';
import { env } from '@repo/config';
import { Socket } from 'socket.io';
import { handleAnyEvent } from './switch.ws';
import { WsManager } from './manager.ws';

@WebSocketGateway({
	namespace: '/notification',
	cors: env.SECURE,
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect
{
	private readonly logger : Logger;
	private wsManager : WsManager;

	constructor()
	{
		this.logger = new Logger(WsGateway.name);
		this.wsManager = new WsManager(this.logger);
	}

	handleConnection(client: Socket): void
	{
		// The gateway authenticates the JWT (via /auth/validate) and injects the trusted
		// userId as the x-user-id header on the handshake. We never trust a client-supplied value.
		const userId = client.handshake.headers['x-user-id'] as string;

		if (!userId)
		{
			this.logger.warn(`Rejected websocket connection ${client.id}: missing authenticated user id`);
			client.disconnect(true);
			return;
		}

		this.wsManager.addClient(userId, client);

		// Listen for any event on the client and log it
		client.onAny((eventName: string, ...args: any[]) =>
		{
			handleAnyEvent(this.logger, client, eventName, ...args);
		});
	}

	handleDisconnect(client: Socket): void
	{
		this.wsManager.removeClient(client);
	}

	count(): number
	{
		return (this.wsManager.count());
	}

	closeConnectionsForUser(userId: string): void
	{
		const sockets = this.wsManager.getSocketsByUserId(userId);
		if (sockets)
		{
			sockets.forEach((socket) =>
			{
				socket.disconnect(true);
				this.logger.log(`Closed WebSocket connection for user ID ${userId}`);
			});
		}
		else
		{
			this.logger.warn(`No WebSocket connections found for user ID ${userId}`);
		}
	}

}