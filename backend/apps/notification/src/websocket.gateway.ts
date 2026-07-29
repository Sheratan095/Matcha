import { Logger } from '@nestjs/common';
import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websockets';
import { env } from '@repo/config';

@WebSocketGateway({
	namespace: '/notification',
	cors: env.SECURE,
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect
{
	private readonly logger = new Logger(NotificationGateway.name);

	handleConnection(client: { id: string }): void
	{
		this.logger.log(`Client connected to notification websocket: ${client.id}`);
	}

	handleDisconnect(client: { id: string }): void
	{
		this.logger.log(`Client disconnected from notification websocket: ${client.id}`);
	}

	@SubscribeMessage('notification')
	handleNotification(client: { id: string }, data: any): void
	{
		this.logger.log(`Received notification for client ${client.id}: ${JSON.stringify(data)}`);
	}
}