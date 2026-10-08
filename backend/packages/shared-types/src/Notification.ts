// Live notification contract shared between the producers (auth, profile, ...) and the
// notification service. Each NotificationType value doubles as the socket.io event name the
// browser listens on (e.g. socket.on('profile-view', ...)), so these strings are part of the
// public WebSocket API — see docs/WEBSOCKETS.md.
export enum NotificationType
{
	PROFILE_VIEW = 'profile-view',
	PROFILE_LIKE = 'profile-like',
	UNLIKE       = 'profile-unlike',
	MATCHED      = 'match',
	UNMATCHED    = 'unmatch',
	MESSAGE      = 'message',
}

// Payloads for the remaining types are declared as their producing features land.
// Keeping the enum complete lets the frontend and docs reference every planned event name today.
