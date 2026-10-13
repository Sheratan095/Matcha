import { Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { env } from "@repo/config";
import { DbService } from '../db/db.service';
import { NotificationType, MessageStatus } from "@repo/shared-types";

export class WsManager
{
	// Map of connected clients, where the key is the user ID and the value is a set of sockets associated with that user
	// This allows for multiple connections per user (e.g., from different devices or browser tabs)
	private clients: Map<string, Set<Socket>>;

	// Map to hold pending notifications for users who are not currently connected
	private pendingNotifications: Map<string, any[]>;

	private logger: Logger;
	private dbService: DbService;

	constructor(logger: Logger, dbService: DbService)
	{
		// Initialize the clients map
		this.clients = new Map();
		this.pendingNotifications = new Map();

		this.logger = logger;
		this.dbService = dbService;
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

		// If there are any pending notifications for this user, send them now
		this.sendPendingNotifications(userId);
	}

	// Remove a client connection for a user. Returns the userId when that was the user's
	// LAST socket (they are now fully offline), or undefined otherwise, so the caller can
	// persist a last-seen timestamp exactly once per user going offline.
	removeClient(socket: Socket): string | undefined
	{
		// Find the user ID associated with the socket
		const userId = this.getUserIdBySocket(socket);

		// Unknown socket: nothing to remove, nobody went offline.
		if (userId === undefined)
			return (undefined);

		// Remove just the specific socket
		this.clients.get(userId)?.delete(socket);

		// If the user has no more sockets, remove the user from the map: THEY WENT OFFLINE.
		let	wentOffline = false;
		if (this.clients.get(userId)?.size === 0)
		{
			this.clients.delete(userId);
			wentOffline = true;
		}

		const remainingSockets : number = this.clients.get(userId)?.size || 0;
		this.logger.log(`Websocket disconnected: UserId: ${userId}, SocketId: ${socket.id}, RemainingSockets: ${remainingSockets}`);

		return (wentOffline ? userId : undefined);
	}

	// public method to get the total number of unique users currently connected via WebSocket
	count(): number
	{
		// if a user has multiple sockets, we only want to COUNT THEM ONCE, so we return the size of the clients map
		return (this.clients.size);
	}

	// send a message to all sockets associated with a specific user ID
	// Store is used to avoid storing temporary messages like online/offline/chat-seen
	async sendMessageToUser(userId: string, event: string, message: any, store: boolean): Promise<boolean>
	{
		const sockets = this.clients.get(userId);
		if (sockets)
		{
			for (const socket of sockets)
				socket.emit(event, message);

			// Update message status, not wait for it
			if (event === NotificationType.MESSAGE)
				await this.dbService.updateMessageStatus(message.messageId, MessageStatus.SENT);

			return (true);
		}
		else
		{
			// If the user is not connected, add the notification to the pending queue
			if (store)
				this.addPendingNotification(userId, event, message);

			return (false);
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

	addPendingNotification(userId: string, event: string, message: any): void
	{
		if (!this.pendingNotifications.has(userId))
			this.pendingNotifications.set(userId, []);

		const queue = this.pendingNotifications.get(userId)!;

		queue.push({ event, message });

		// Cap the per-user queue so an offline user can't grow it without bound; drop the oldest to keep the newest.
		if (queue.length > env.NOTIFICATION_MAX_PENDING_PER_USER)
			queue.shift();
	}

	sendPendingNotifications(userId: string): void
	{
		const	pending = this.pendingNotifications.get(userId);
		if (!pending)
			return;

		this.logger.log(`Sent pending ${pending.length} notifications for user ID ${userId}`);

		// Detach the queue up front: `pending` is now a PRIVATE SNAPSHOT, so nothing is mutated
		// mid-iteration. Anything that fails to send is re-queued (in order) into a fresh list
		// by sendMessageToUser(), since the key is already gone from the map.
		this.pendingNotifications.delete(userId);

		for (const { event, message } of pending)
			this.sendMessageToUser(userId, event, message, true);
	}
}