// One entry in the "my chats" list: the conversation id, the other participant, and a preview of
// the latest message. chatId is what the client passes to GET /chat/:chatId for the history.
// There is no unread count yet (no read-state is tracked server-side).
export interface IChatListItem
{
	chatId: string;             // the conversation id (chats.id)
	userId: string;             // the other participant
	username: string;
	profilePictureUrl: string | null;
	lastMessage: string;        // content of the most recent message in the conversation
	timestamp: number;          // epoch ms of that most recent message
	lastSenderId: string;       // who sent it (lets the UI show a "You: ..." prefix)
}

export class ChatListItem implements IChatListItem
{
	chatId: string;
	userId: string;
	username: string;
	profilePictureUrl: string | null;
	lastMessage: string;
	timestamp: number;
	lastSenderId: string;

	constructor(data: IChatListItem)
	{
		this.chatId            = data.chatId;
		this.userId            = data.userId;
		this.username          = data.username;
		this.profilePictureUrl = data.profilePictureUrl;
		this.lastMessage       = data.lastMessage;
		this.timestamp         = data.timestamp;
		this.lastSenderId      = data.lastSenderId;
	}

	// getChatList returns the chat id as chat_id, the other participant as user_id, their picture
	// as profile_picture_url, and the latest message's content / created_at / sender_id as
	// last_message / last_created_at / last_sender_id.
	static fromDbRow(row: any): ChatListItem
	{
		return (new ChatListItem({
			chatId:            row.chat_id,
			userId:            row.user_id,
			username:          row.username,
			profilePictureUrl: row.profile_picture_url ?? null,
			lastMessage:       row.last_message,
			timestamp:         new Date(row.last_created_at).getTime(),
			lastSenderId:      row.last_sender_id,
		}));
	}
}
