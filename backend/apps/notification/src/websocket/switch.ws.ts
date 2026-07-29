import { Socket } from 'socket.io';

// Switch between different event handlers based on the event name
export function handleAnyEvent(client: Socket, eventName: string, ...args: any[]): void
{
	console.log(`Inbound event on ${client.id}: ${eventName} ${JSON.stringify(args)}`);
}