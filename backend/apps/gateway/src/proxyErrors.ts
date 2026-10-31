import { Logger } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';

// A service that accepts the connection but never answers would otherwise hold the client forever.
// Every HTTP endpoint answers well within this. Not used on the socket.io proxy: long-polling
// requests are held open on purpose (up to socket.io's pingInterval, 25 s by default).
export const	PROXY_TIMEOUT_MS = 30_000;

// http-proxy-middleware v3 drops its default error response as soon as an on.error handler is
// given, so this handler must answer the client itself, or the request hangs until the browser
// gives up. Same body shape as Nest's HttpException, so the frontend reads it like any other error.
export function	proxyErrorHandler(logger: Logger, service: string)
{
	return ((err: NodeJS.ErrnoException, req: IncomingMessage, res: ServerResponse | Socket) =>
	{
		logger.error(`Proxy error (${service}) on ${req.method} ${req.url}: ${err.code ?? err.message}`);

		// WebSocket upgrade, or a response already half sent: there is nothing valid left to write,
		// so drop the connection and let the client see it fail.
		if (!(res instanceof ServerResponse) || res.headersSent)
		{
			res.destroy();
			return;
		}

		// proxyTimeout aborts the request, which surfaces as ECONNRESET: the service is up but not
		// answering. Anything else (ECONNREFUSED, ENOTFOUND, ...) means it can't be reached at all.
		const	timedOut = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
		const	statusCode = timedOut ? 504 : 502;
		const	error = timedOut ? 'Gateway Timeout' : 'Bad Gateway';

		res.statusCode = statusCode;
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify({ statusCode, message: `The ${service} service is unavailable, try again later`, error }));
	});
}
