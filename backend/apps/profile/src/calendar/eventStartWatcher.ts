import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { NotificationType } from '@repo/shared-types';
import { DbService } from '../db/db.service';
import { sendEventNotification } from '../utils/notification';

// Tells both sides of an accepted date that it has started ('event-start' over the socket).
//
// Nothing else in the backend runs on a clock, so this polls: every TICK_MS it asks for the accepted
// events whose start fell since the previous pass, and announces each one once. The watermark lives in
// memory and starts at boot, so a date that started while the service was down is not announced late:
// 'event-start' is a live nudge (the notification service does not queue it), and the client shows a
// started date on its own. A pass whose lookup fails leaves the watermark where it was, so the next
// one covers the same window again.
@Injectable()
export class EventStartWatcher implements OnModuleInit, OnModuleDestroy
{
	static readonly TICK_MS = 30_000;

	private readonly logger = new Logger('PROFILE EventStartWatcher');
	private timer: ReturnType<typeof setInterval> | null = null;
	private watermark: Date = new Date();
	private running = false;

	constructor(
		private readonly dbService: DbService,
		private readonly httpService: HttpService,
	) {}

	onModuleInit(): void
	{
		this.watermark = new Date();
		this.timer = setInterval(() => void this.tick(), EventStartWatcher.TICK_MS);
		// The HTTP server keeps the process alive; this timer alone must not.
		this.timer.unref?.();
	}

	onModuleDestroy(): void
	{
		if (this.timer)
			clearInterval(this.timer);
		this.timer = null;
	}

	// One pass: announces the dates that started in (watermark, now]. Returns how many it found.
	async tick(now: Date = new Date()): Promise<number>
	{
		// A slow pass is not overlapped by the next one (which would announce the same dates twice).
		if (this.running)
			return (0);
		this.running = true;

		try
		{
			const	events = await this.dbService.getEventsStartingBetween(this.watermark, now);
			this.watermark = now;

			for (const event of events)
			{
				// Non-blocking per date: one failed notification must not hold back the others.
				try
				{
					await sendEventNotification(event.inviteeId, event.inviterId, event.inviterId, event.eventId, event.title, event.startTime, this.httpService, NotificationType.EVENT_START);
				}
				catch (notifyError: any)
				{
					this.logger.warn(`Failed to send event start notification for event ${event.eventId}`, notifyError);
				}
			}

			if (events.length > 0)
				this.logger.log(`Announced the start of ${events.length} calendar event(s)`);

			return (events.length);
		}
		catch (error: any)
		{
			this.logger.error('Failed to look up the calendar events that started', error);
			return (0);
		}
		finally
		{
			this.running = false;
		}
	}
}
