import { createContext } from 'react';

export type Language = 'ar' | 'en';
// The App language state owns both copy and layout. No I18nManager restart or global mutation.
export const UiLanguage = createContext<Language>('ar');

export function layoutFor(language: Language) {
  return language === 'ar'
    ? { direction: 'rtl' as const, writingDirection: 'rtl' as const, textAlign: 'right' as const }
    : { direction: 'ltr' as const, writingDirection: 'ltr' as const, textAlign: 'left' as const };
}
