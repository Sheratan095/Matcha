export interface IChatReadPayload
{
	userId: string;
	chatId: string;
}

export class ChatReadPayload implements IChatReadPayload
{
	userId: string;
	chatId: string;

	constructor(data: IChatReadPayload)
	{
		this.userId = data.userId;
		this.chatId = data.chatId;
	}
}
