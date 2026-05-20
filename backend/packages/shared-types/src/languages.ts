export enum SupportedLanguages
{
	ENGLISH = 'en',
	FRENCH = 'fr',
	SPANISH = 'es',
}

export const AVAILABLE_LANGUAGES: string[] = Object.values(SupportedLanguages);

export type SupportedLanguage = `${SupportedLanguages}`;
