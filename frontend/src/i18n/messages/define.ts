/**
 * A domain is one part of the app's wording (the deck, the chat, the kit…) with its three languages side by side,
 * so a sentence is translated where it is written and a missing or extra key is a compile error right there.
 * `messages/app/index.ts` merges the domains into the catalogues; `en.ts` stays the source of the key type.
 */
export interface Domain<E extends Record<string, string>> {
  en: E
  fr: Record<keyof E, string>
  es: Record<keyof E, string>
}

export function domain<const E extends Record<string, string>>(messages: Domain<E>): Domain<E> {
  return messages
}
