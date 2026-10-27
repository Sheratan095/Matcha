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

[x] Remove a previously given “like”. This will prevent further notifications from that
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

[x] store pending notification in database

[x] GetProfile should return also username

[x] view the date and time of the last connection

[x] report fake accounts

[x] remove createdAt date in profile-view ws

[x] unlike notification when connected

[x] add somenthing like "relation" to GET /profile/:userId (what about for yourself?)

[x] rename ws viewer/liker .... to otherId

[x] my matches?

[x] check what goes on with stdPayload in case of no profile pic set

[x] check if ther's a way to use the stdPayload also in some Dto

[x] fromViewData/fromLikeData read camelCase keys (row.userId, row.profilePictureUrl) that pg never emits, so /likes and /viewers currently return those two fields as undefined. One-line fix each (read row.viewer_id/row.liker_id + row.profile_picture_url), keeping them separate as you want — want me to apply it?

[x] /notify/profile-like returns 400 — the profile producer sends recipientId but notifyLike.dto.ts requires likedId. I was interrupted before fixing profile/utils/notification.ts. Want that fix now too?

[x] block internal endpointss!!!

[x] removing is online from get my profile?? right as it's done for relations in get profile dto

[x] get likes shuld include also when they're metched??

[x] fix timezone SAVED IN UTC ON DB, FRONTEND SHOULD 'cast' to the correct TIME ZONE

[x] find a way to don't show the exact location (using apporoximante location)??? + location tester!!

[x] msg status? sent, delivered, seen

[x] what about an hash table for pending notification or a way to avoid sendind duplicate notification when user reconnect?
maybe just add check for two users and event in db

[x] protects docs?

[x] redesign emails	

[x] verification emails? 
	keep in this way
	ALLOW JUST VERIFICATION WITH LINK
	allow just verification by code after verification in the same page?

[] wtf style guide?? cool but really needed?

[] logo maybe could be changed - add new logo also in email templates

[] add passes into famerating query?

[x] unify dto errors in globals

[x] Unify expiration time format min/hours -> ms

[x] check if expiration are actually working
	[x] email verification
	[x] access_token
	[x] refresh_oken
	[x] reset psw

[x] Placeholder secrets. make dev copies .env.example to .env, which leaves JWT_ACCESS_SECRET=your_access_token_secret and INTERNAL_KEY=some_random_key. With a publicly known JWT secret, anyone can forge tokens, and a security breach means a score of 0. Have generate_env fill these with openssl rand -hex 32.

[x] Weak password blocklist. common-password.txt has 186 mostly English entries and is matched exactly. The subject says "regardless of language", so soleil, contraseña, or Password with a capital all get through. Use a larger multilingual list and compare case-insensitively.

[x] "Their visit history" is ambiguous. You expose who viewed me, but not the profiles I viewed. The data is already in profile_views, so a "profiles I visited" endpoint would be cheap insurance.

[] Micro-framework rule. The subject excludes frameworks that bundle validators or a user account manager. NestJS with class-validator and passport may come up, so have your argument ready: no ORM, raw SQL through pg, and validation and OAuth come from separate libraries.

[x] Stale comments. The comment at app.controller.ts:356 says pass isn't implemented, but it is. The isProfileComplete comment says "upload at least 5 pictures". Both could confuse anyone reading the code during the defense.

[x] wire up notification for all calendar related events

[] find a wuy to organize profile methods /remove profile from calendar and other categories endpoints