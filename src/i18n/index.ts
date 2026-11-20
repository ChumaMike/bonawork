import { en, type Messages } from "./en";

/**
 * Registered languages. English is the only one today.
 * To add one: create `./<code>.ts` exporting an object typed as `Messages`,
 * add it here, and read the visitor's choice in `getMessages`.
 */
export const LOCALES = { en } satisfies Record<string, Messages>;
export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "en";

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return LOCALES[locale];
}

/**
 * Messages for the current language. A plain function today; it becomes a
 * context read when a second language is added, without changing callers.
 */
export function useMessages(): Messages {
  return getMessages();
}

export type { Messages };
