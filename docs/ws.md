WS

private clients: Map<string, Set<Socket>> = new Map();

Ws connections are stored in this way to allow user to login from multiple devices/tabs at the same time

export interface IStdPayload
{
	userId: string;
	username: string;
	profilePictureUrl: string | null;
}
this is the standard payload for every ws sent server -> client

TO DO add a different contend for chat messages??