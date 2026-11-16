import { SupportedLanguages, SupportedLanguage } from '@repo/shared-types';
import { englishVerificationPack, englishForgotPasswordPack, englishPasswordChangedPack } from './en';
import { frenchVerificationPack, frenchForgotPasswordPack, frenchPasswordChangedPack } from './fr';
import { spanishVerificationPack, spanishForgotPasswordPack, spanishPasswordChangedPack } from './es';

type VerificationPack = typeof englishVerificationPack;
type ForgotPasswordPack = typeof englishForgotPasswordPack;
type PasswordChangedPack = typeof englishPasswordChangedPack;

// It enforces that every supported language has a corresponding verification pack
// In case of error:
// matcha/notification:dev: src/mail/mailer.service.ts - error TS2345: Argument of type 'string' is not assignable to parameter of type '"en" | "fr" | "es"'.
const verificationPacks: Record<SupportedLanguage, VerificationPack> = {
	[SupportedLanguages.ENGLISH]: englishVerificationPack,
	[SupportedLanguages.FRENCH]: frenchVerificationPack,
	[SupportedLanguages.SPANISH]: spanishVerificationPack,
};

const forgotPasswordPacks: Record<SupportedLanguage, ForgotPasswordPack> = {
	[SupportedLanguages.ENGLISH]: englishForgotPasswordPack,
	[SupportedLanguages.FRENCH]: frenchForgotPasswordPack,
	[SupportedLanguages.SPANISH]: spanishForgotPasswordPack,
};

const passwordChangedPacks: Record<SupportedLanguage, PasswordChangedPack> = {
	[SupportedLanguages.ENGLISH]: englishPasswordChangedPack,
	[SupportedLanguages.FRENCH]: frenchPasswordChangedPack,
	[SupportedLanguages.SPANISH]: spanishPasswordChangedPack,
};

export function getVerificationPack(language: SupportedLanguage = SupportedLanguages.ENGLISH): VerificationPack {
	return verificationPacks[language] || verificationPacks[SupportedLanguages.ENGLISH];
}

export function getForgotPasswordPack(language: SupportedLanguage = SupportedLanguages.ENGLISH): ForgotPasswordPack {
	return forgotPasswordPacks[language] || forgotPasswordPacks[SupportedLanguages.ENGLISH];
}

export function getPasswordChangedPack(language: SupportedLanguage = SupportedLanguages.ENGLISH): PasswordChangedPack {
	return passwordChangedPacks[language] || passwordChangedPacks[SupportedLanguages.ENGLISH];
}

export { getVerificationPack as getLanguagePack }; // Backwards compatibility

export type { VerificationPack, ForgotPasswordPack, PasswordChangedPack };
