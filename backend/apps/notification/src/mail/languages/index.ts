import { SupportedLanguages, SupportedLanguage } from '@repo/shared-types';
import { englishLanguagePack } from './en';
import { frenchLanguagePack } from './fr';
import { spanishLanguagePack } from './es';

type LanguagePack = typeof englishLanguagePack;

// It enforces that every supported language has a corresponding language pack
// In case of error:
// matcha/auth:dev: src/app.service.ts:68:52 - error TS2345: Argument of type 'string' is not assignable to parameter of type '"en" | "fr" | "es"'.
const languagePacks: Record<SupportedLanguage, LanguagePack> = {
	[SupportedLanguages.ENGLISH]: englishLanguagePack,
	[SupportedLanguages.FRENCH]: frenchLanguagePack,
	[SupportedLanguages.SPANISH]: spanishLanguagePack,
};

export function getLanguagePack(language: SupportedLanguage = SupportedLanguages.ENGLISH): LanguagePack {
	return languagePacks[language] || languagePacks[SupportedLanguages.ENGLISH];
}

export type { LanguagePack };
