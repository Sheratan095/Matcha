export const englishVerificationPack = {
	subject: 'Verify your email address',
	title: 'Email Verification',
	greeting: 'Hello',
	message: 'Thank you for signing up! Please verify your email address by clicking the button below.',
	buttonText: 'Verify email',
	otpLabel: 'Verification Code',
	expiryText: 'This link will expire in {{EXPIRY_MINUTES}} minutes.',
	securityTitle: 'Security Tips:',
	securityPoints: [
		'Never share this code with anyone',
		'Matcha will never ask for this code via email',
		'If you did not create this account, please ignore this email',
		'Link expires in {{EXPIRY_MINUTES}} minutes',
	],
	footerMessage: 'Best regards,',
	footerText: 'The Matcha Team',
	plainText: 'Your verification code is: {{OTP_CODE}}. This code will expire in {{EXPIRY_MINUTES}} minutes.',
	allRightsReserved: 'All rights reserved',
};

export const englishForgotPasswordPack = {
	subject: 'Reset your password',
	title: 'Password Reset Request',
	greeting: 'Hello',
	message: 'We received a request to reset your password. Click the button below to create a new password.',
	alertMessage: 'If you did not request a password reset, please ignore this email or contact our support team immediately.',
	buttonText: 'Reset Password',
	otpLabel: 'Reset Code',
	expiryText: 'This link will expire in {{EXPIRY_MINUTES}} minutes.',
	securityTitle: 'Security Tips:',
	securityPoints: [
		'Never share this code with anyone',
		'Matcha will never ask for this code via email or message',
		'If you did not request this, change your password immediately',
		'Link expires in {{EXPIRY_MINUTES}} minutes',
	],
	footerMessage: 'Best regards,',
	footerText: 'The Matcha Team',
	plainText: 'Your password reset code is: {{OTP_CODE}}. This code will expire in {{EXPIRY_MINUTES}} minutes. If you did not request this, please ignore this email.',
	allRightsReserved: 'All rights reserved',
};

// Sent right after a successful password reset: the user's alarm bell if they did not make the change
export const englishPasswordChangedPack = {
	subject: 'Your password was changed',
	title: 'Password Changed',
	greeting: 'Hello',
	message: 'The password of your Matcha account was just changed, and every device signed in to it has been signed out.',
	alertMessage: 'If you did not make this change, someone else may have access to your email. Reset your password right away and secure your email account.',
	buttonText: 'Reset Password',
	noteText: 'If you made this change, you can ignore this email.',
	securityTitle: 'Security Tips:',
	securityPoints: [
		'Use a password you do not use anywhere else',
		'Matcha will never ask for your password via email or message',
		'Check that your email account itself is secure',
	],
	footerMessage: 'Best regards,',
	footerText: 'The Matcha Team',
	plainText: 'The password of your Matcha account was just changed. If you did not make this change, reset your password right away: {{RESET_LINK}}',
	allRightsReserved: 'All rights reserved',
};
