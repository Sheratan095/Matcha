// One entry in the "my chats" list: the other participant plus a preview of the latest message
// in that conversation. There is no unread count yet (no read-state is tracked server-side).
export interface IChatListItem
{
	userId: string;             // the other participant
	username: string;
	profilePictureUrl: string | null;
	lastMessage: string;        // content of the most recent message in the conversation
	timestamp: number;          // epoch ms of that most recent message
	lastSenderId: string;       // who sent it (lets the UI show a "You: ..." prefix)
}

export class ChatListItem implements IChatListItem
{
	userId: string;
	username: string;
	profilePictureUrl: string | null;
	lastMessage: string;
	timestamp: number;
	lastSenderId: string;

	constructor(data: IChatListItem)
	{
		this.userId            = data.userId;
		this.username          = data.username;
		this.profilePictureUrl = data.profilePictureUrl;
		this.lastMessage       = data.lastMessage;
		this.timestamp         = data.timestamp;
		this.lastSenderId      = data.lastSenderId;
	}

	// getChatList aliases the partner id + picture to user_id / profile_picture_url and returns the
	// latest message's content / created_at / sender_id as last_message / last_created_at /
	// last_sender_id.
	static fromDbRow(row: any): ChatListItem
	{
		return (new ChatListItem({
			userId:            row.user_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
			lastMessage:       row.last_message,
			timestamp:         new Date(row.last_created_at).getTime(),
			lastSenderId:      row.last_sender_id,
		}));
	}
}
