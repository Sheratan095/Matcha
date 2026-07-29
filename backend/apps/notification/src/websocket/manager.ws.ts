import { Socket } from "socket.io";
import { Logger } from "@nestjs/common";

export class WsManager
{
	// Map of connected clients, where the key is the user ID and the value is a set of sockets associated with that user
	// This allows for multiple connections per user (e.g., from different devices or browser tabs)
	private clients: Map<string, Set<Socket>>;
	private logger: Logger;

	constructor(logger: Logger)
	{
		// Initialize the clients map
		this.clients = new Map();

		this.logger = logger;
	}

	// Add a new client connection for a user
	addClient(userId: string, socket: Socket): void
	{
		// If the user does not already have a set of sockets, create one
		if (!this.clients.has(userId))
			this.clients.set(userId, new Set());

		// Add the new socket to the user's set of sockets
		this.clients.get(userId)?.add(socket);

		const totalSockets : number = this.clients.get(userId)?.size || 0;
		this.logger.log(`Websocket connected: UserId: ${userId}, SocketId: ${socket.id}, TotalSockets: ${totalSockets}`);
	}

	// Remove a client connection for a user
	removeClient(socket: Socket): void
	{
		// Find the user ID associated with the socket
		const userId = this.getUserIdBySocket(socket);

		// If the user has a set of sockets
		if (userId !== undefined)
		{
			// Remove just the specific socket
			this.clients.get(userId)?.delete(socket);

			// If the user has no more sockets, remove the user from the map
			if (this.clients.get(userId)?.size === 0)
				this.clients.delete(userId);

			const remainingSockets : number = this.clients.get(userId)?.size || 0;
			this.logger.log(`Websocket disconnected: UserId: ${userId}, SocketId: ${socket.id}, RemainingSockets: ${remainingSockets}`);
		}
	}

	//-------------------------------------UTILS-------------------------------------

	getSocketsByUserId(userId: string): Set<Socket> | undefined
	{
		return (this.clients.get(userId));
	}

	getUserIdBySocket(socket: Socket): string | undefined
	{
		for (const [userId, sockets] of this.clients.entries())
		{
			if (sockets.has(socket))
				return (userId);
		}
		return (undefined);
	}
}