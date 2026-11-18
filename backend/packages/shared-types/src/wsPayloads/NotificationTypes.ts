// Live notification contract shared between the producers (auth, profile, ...) and the
// notification service. Each NotificationType value doubles as the socket.io event name the
// browser listens on (e.g. socket.on('profile-view', ...)), so these strings are part of the
// public WebSocket API — see docs/WEBSOCKETS.md.
export enum NotificationType
{
	PROFILE_VIEW = 'profile-view',
	PROFILE_LIKE = 'profile-like',
	// UNLIKE       = 'profile-unlike',
	MATCHED      = 'match',
	UNMATCHED    = 'unmatch',
	MESSAGE      = 'message',
	CHAT_SEEN    = 'chat-seen', // Sent when a user opens a chat, so the other participant can mark their messages as read
	// Calendar events
	EVENT_INVITE = 'event-invite', // Sent when a user is invited to a calendar event
	EVENT_ACCEPT = 'event-accept', // Sent when a user accepts a calendar event
	EVENT_DECLINE = 'event-decline', // Sent when a user declines a calendar event
	EVENT_CANCEL = 'event-cancel', // Sent when a user cancels a calendar event
	EVENT_START = 'event-start', // Sent to both sides when an accepted calendar event starts (live only, not queued)
}

// Payloads for the remaining types are declared as their producing features land.
// Keeping the enum complete lets the frontend and docs reference every planned event name today.
