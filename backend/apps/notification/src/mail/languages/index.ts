import { englishLanguagePack } from './en';
import { frenchLanguagePack } from './fr';
import { spanishLanguagePack } from './es';

type LanguagePack = typeof englishLanguagePack;

const languagePacks: Record<string, LanguagePack> = {
	en: englishLanguagePack,
	fr: frenchLanguagePack,
	es: spanishLanguagePack,
};

export function getLanguagePack(language: string = 'en'): LanguagePack {
	return languagePacks[language] || languagePacks['en'];
}

export type { LanguagePack };
