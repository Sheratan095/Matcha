/**
 * Interface language (en / fr / es). A leaf module: it imports nothing from `@/ui`, so the kit can use it.
 * Read docs/frontend/ARCHITECTURE.md §8 before adding strings.
 */
export {
  DEFAULT_LOCALE,
  LANGUAGE_NAMES,
  STORAGE_KEY,
  detectLocale,
  getLocale,
  isLocale,
  setLocale,
  useLocale,
  useLocaleState,
} from './locale'
export type { Locale } from './locale'
export { CATALOGUES, placeholdersOf, t, tn, translate, translatePlural, translatorFor, useT } from './translate'
export type { MessageKey, Messages, Params, PluralKey, Translator } from './translate'
export { dateFormat, localeTag, numberFormat, pluralCategory } from './format'
