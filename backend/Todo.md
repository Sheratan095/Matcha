[x] Graph-oriented database: don't need it

[x] auth jwt

[x] Password policy and username contrainsts
	[x] Create and write
	[x] Test

[x] Add language in to registration to allow verification email to be sent in that language
[x] Add last and first name to registration

[x] Afer-registration link to verify account
	[x] verification endpoint
	[x] change login to redirect to email verification in case of login on not verified account
		it should mitigate the errors
	[x] expiration work
	[x] what if errors during verification email send : simulated adding a fake exception in email send

[x] Via-mail password reset
	[x] Rework mailer.service in notification
	[x] Create template and language pack ad-hoc
	[x] Create endpoint and hanlder in notification service
	[x] Test endpoint
	[x] Create endpoint and henalder in auth service 'auth/reset-password'
	[x] Test endpoint
	[x] Create a send-email "astraction" / organize notification in auth
	[x] Use user instead of single params to comunicate between functions
	[x] Test everithing together

[x] Avoid to expose email existance when sending email
	[x] Implement generic response for forgot-password endpoint
	[x] Updated auth_flow.txt documentation

[x] Remove email verification token after usage also refresh_token at logout

[x] Store email and psw reset token and refresh_token hashed instead of plain?

[x] Insert expiration in token with userId to check eventual expiration?

[x] Should new verification code be sent during login even if the psw is wrong? : NO

[x] Find a way to add watch also to packages

[x] Check refresh_token expiration

[x] Password different that the previus one
	[x] BROKEN, seems like ther're no psw in db

[x] Too common psw

[x] Forbidden usernames
	[x] Check for username lowercasing?

[x] Oauth shutty

[x] Update email address

[x] Trim all dtos

[] RATE LIMITING (also in garage)

[x] pending noiificaiton

[] Remove a previously given “like”. This will prevent further notifications from that
user, and the chat function between them will be disabled.

[x] login with not verified email doesn't works,should sent another code

[x] ALLOW JUST AUTHENTICATED USER TO CONNECT TO WS

[x] UserID UUID string or int?? IN WHOLE PROJECT

[x] wtf is photo position??

[x] verify user completition and check that the api isn't callable from out

[x] /profile/viewers should return also name and profile pic link?

[x] get /profile = get my profile

[x] In getProfile and updateProfile, the catch block turns the "Profile not found" error into a 500. Those endpoints never return a proper "not found" response.

[x] Deleting the current profile picture doesn't make another picture the profile picture; the user has none until they pick one.

[x] test oauth2 github shitty shit

[x] garage .toml file contains a 127.0.0.1 address, maybe it will not work in prod?
	think is should be to modify only with a real domain for prod

[x] {{EXPIRY_MINUTES}} in forgot psw email

[] store pending notification in database

[x] GetProfile should return also username

[x] view the date and time of the last connection

[x] report fake accounts

[x] remove createdAt date in profile-view ws

[x] unlike notification when connected

[] add somenthing like "relation" to GET /profile/:userId (what about for yourself?)

[x] rename ws viewer/liker .... to otherId

[x] my matches?

[x] check what goes on with stdPayload in case of no profile pic set

[x] check if ther's a way to use the stdPayload also in some Dto

[x] fromViewData/fromLikeData read camelCase keys (row.userId, row.profilePictureUrl) that pg never emits, so /likes and /viewers currently return those two fields as undefined. One-line fix each (read row.viewer_id/row.liker_id + row.profile_picture_url), keeping them separate as you want — want me to apply it?

[x] /notify/profile-like returns 400 — the profile producer sends recipientId but notifyLike.dto.ts requires likedId. I was interrupted before fixing profile/utils/notification.ts. Want that fix now too?

[] block internal endpointss!!!

[x] removing is online from get my profile?? right as it's done for relations in get profile dto

[] get likes shuld include also when they're metched??

[] fix timezone