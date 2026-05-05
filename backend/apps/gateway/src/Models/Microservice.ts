
export class	Microservice
{
	public name: string;
	public host: string;
	public port: number;
	public docsUrl: string;

	constructor(name: string, host: string, port: number, docsUrl: string)
	{
		this.name = name;
		this.host = host;
		this.port = port;
		this.docsUrl = docsUrl;
	}
}