import { HttpService } from "@nestjs/axios";
import { env } from "@repo/config";
import { firstValueFrom } from "rxjs";

// Calls the PROFILE service (internally) to create the profile row that pairs 1:1
// with a freshly registered user. HttpService is already configured with the
// internal-key header in app.module, so the profile service's InternalKeyGuard accepts it.
export async function createUserProfile(userId: number, firstName: string, lastName: string, httpService: HttpService)
{
	try
	{
		// firstValueFrom subscribes to the Observable so the request is actually sent
		// (a bare httpService.post(...) is a cold Observable and would never fire).
		await firstValueFrom(httpService.post(`${env.PROFILE_HOST}:${env.PROFILE_PORT}/profile`,
		{
			userId,
			firstName,
			lastName
		}));
	}
	catch (err)
	{
		// Rethrow so the caller (auth register flow) can decide how to handle it
		throw err;
	}
}
