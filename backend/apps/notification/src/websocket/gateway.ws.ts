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
		this.wsManager.addClient(client.handshake.query.userId as string, client);

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

}