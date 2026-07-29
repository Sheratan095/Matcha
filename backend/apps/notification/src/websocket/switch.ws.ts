import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// Switch between different event handlers based on the event name
export function handleAnyEvent(logger: Logger, client: Socket, eventName: string, ...args: any[]): void
{
	logger.log(`Inbound event on ${client.id}: ${eventName} ${JSON.stringify(args)}`);
}