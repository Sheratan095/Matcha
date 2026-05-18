import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService
{
	sendVerificationEmail(email: string, token: string)
	{
		console.log('Received request to send verification email to ' + email + ' with token ' + token);
		return ('Sending verification email to ' + email + ' with token ' + token);
	}
}