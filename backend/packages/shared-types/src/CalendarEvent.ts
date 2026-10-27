export interface ICalendarEvent
{
	eventId: string;      // the event's UUID

	inviterId: string;    // the user who created the event
	inviteeId: string;    // the user who was invited to the event

	title: string;        // the title of the event
	description: string | null;  // the description of the event

	startTime: string;    // ISO 8601 formatted start time of the event
	endTime: string;      // ISO 8601 formatted end time of the event

	status: string;       // status of the event (e.g., confirmed, pending, declined, cancelled)

	latitude: number | null;   // latitude in decimal degrees, at full precision; null if no location set
	longitude: number | null;  // longitude in decimal degrees, at full precision; null if no location set
}

export class CalendarEvent implements ICalendarEvent
{
	eventId: string;
	inviterId: string;
	inviteeId: string;
	title: string;
	description: string | null;
	startTime: string;
	endTime: string;
	status: string;
	latitude: number | null;
	longitude: number | null;

	constructor(data: ICalendarEvent)
	{
		this.eventId     = data.eventId;
		this.inviterId   = data.inviterId;
		this.inviteeId   = data.inviteeId;
		this.title       = data.title;
		this.description = data.description;
		this.startTime   = data.startTime;
		this.endTime     = data.endTime;
		this.status      = data.status;
		this.latitude    = data.latitude;
		this.longitude   = data.longitude;
	}

	static fromDbRow(row: any): CalendarEvent
	{
		return (new CalendarEvent({
			eventId:     row.event_id,
			inviterId:   row.inviter_id,
			inviteeId:   row.invitee_id,
			title:       row.title,
			description: row.description,
			startTime:   row.start_time,
			endTime:     row.end_time,
			status:      row.status,
			latitude:    row.latitude,
			longitude:   row.longitude,
		}));
	}
}
