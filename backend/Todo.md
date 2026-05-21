[] Graph-oriented database

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

[] Via-mail password reset
	[x] Rework mailer.service in notification
	[x] Create template and language pack ad-hoc
	[x] Create endpoint and hanlder in notification service
	[x] Test endpoint
	[] Create endpoint and henalder in auth service 'auth/reset-password'
	[x] Create a send-email "astraction" / organize notification in auth
	[x] Use user instead of single params to comunicate between functions

[x] Should new verification code be sent during login even if the psw is wrong? : NO

[x] Find a way to add watch also to packages

[x] Check refresh_token expiration