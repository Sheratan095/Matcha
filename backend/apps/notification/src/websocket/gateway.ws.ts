import { Logger } from '@nestjs/common';
import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { NotificationType } from '@repo/shared-types';
import { Socket } from 'socket.io';
import { handleAnyEvent } from './switch.ws';
import { WsManager } from './manager.ws';
import { DbService } from '../db/db.service';

// No socket.io CORS on purpose: browsers only reach this server through the gateway, which
// already answers CORS for FRONTEND_URL. Enabling it here made socket.io send
// Access-Control-Allow-Origin: * on polling responses, overwriting the gateway's header,
// and browsers reject * on credentialed requests.
@WebSocketGateway({
	namespace: '/notification',
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect
{
	private readonly logger : Logger;
	private wsManager : WsManager;

	constructor(private readonly dbService: DbService)
	{
		this.logger = new Logger(WsGateway.name);
		this.wsManager = new WsManager(this.logger, this.dbService);
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

	async handleDisconnect(client: Socket): Promise<void>
	{
		// removeClient returns the userId only when this was their LAST socket, so we stamp
		// last-seen exactly once per user going fully offline.
		const offlineUserId = this.wsManager.removeClient(client);

		if (offlineUserId)
		{
			// A DB hiccup must not throw inside the socket lifecycle; just log it.
			try
			{
				await this.dbService.updateLastSeen(offlineUserId);
			}
			catch (err: any)
			{
				this.logger.warn(`Failed to persist last_seen for user ${offlineUserId}: ${err.message}`);
			}
		}
	}

	isUserOnline(userId: string): boolean
	{
		const sockets = this.wsManager.getSocketsByUserId(userId);

		return (sockets !== undefined && sockets.size > 0);
	}

	count(): number
	{
		return (this.wsManager.count());
	}

	// Emit a notification to a user. The event name is the NotificationType value, so the browser
	// listens per type (e.g. socket.on('profile-view', ...)). Returns false when the user was
	// offline and the payload was queued instead. See docs/WEBSOCKETS.md.
	async sendToUser(userId: string, event: NotificationType, payload: any, store: boolean): Promise<boolean>
	{
		return (await this.wsManager.sendMessageToUser(userId, event, payload, store));
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