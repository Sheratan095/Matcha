/**
 * The app's domains merged into one catalogue per language. A domain's keys carry its own prefix (`kit.`, `deck.`…),
 * and `i18n.test.tsx` checks that no two domains share a key, so the spread below never overrides one by accident.
 */
import { activity } from './activity'
import { chat } from './chat'
import { checks } from './checks'
import { deck } from './deck'
import { kit } from './kit'
import { me } from './me'
import { onboarding } from './onboarding'
import { places } from './places'
import { profile } from './profile'
import { shell } from './shell'

export const DOMAINS = { activity, chat, checks, deck, kit, me, onboarding, places, profile, shell }

export const appEn = { ...activity.en, ...chat.en, ...checks.en, ...deck.en, ...kit.en, ...me.en, ...onboarding.en, ...places.en, ...profile.en, ...shell.en }
export const appFr = { ...activity.fr, ...chat.fr, ...checks.fr, ...deck.fr, ...kit.fr, ...me.fr, ...onboarding.fr, ...places.fr, ...profile.fr, ...shell.fr }
export const appEs = { ...activity.es, ...chat.es, ...checks.es, ...deck.es, ...kit.es, ...me.es, ...onboarding.es, ...places.es, ...profile.es, ...shell.es }
