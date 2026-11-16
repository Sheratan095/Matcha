import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// Both come straight from the client, so both are bounded and neutralised before they reach a log line.
const	MAX_EVENT_NAME_LENGTH = 64;
const	MAX_LOGGED_ARGS_LENGTH = 200;

// Switch between different event handlers based on the event name
export function handleAnyEvent(logger: Logger, client: Socket, eventName: string, ...args: any[]): void
{
	// The event name is an arbitrary client-chosen string: a newline in it would start a fake log
	// line (log forging), so anything outside printable ASCII becomes '?'.
	const	safeName = String(eventName).replace(/[^\x20-\x7E]/g, '?').slice(0, MAX_EVENT_NAME_LENGTH);

	// JSON.stringify already escapes control characters inside the payload, so only the size needs
	// bounding: a client can emit arbitrarily large events and each one is logged. It can also
	// throw (a BigInt, a cycle), and an exception here would escape the socket's listener.
	let	payload: string;

	try
	{
		payload = JSON.stringify(args);
	}
	catch
	{
		payload = '[unserialisable]';
	}

	if (payload.length > MAX_LOGGED_ARGS_LENGTH)
		payload = `${payload.slice(0, MAX_LOGGED_ARGS_LENGTH)}... (${payload.length} chars)`;

	logger.log(`Inbound event on ${client.id}: ${safeName} ${payload}`);
}
