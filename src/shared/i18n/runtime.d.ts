export type Language = 'id' | 'en';
export const LANGUAGE_KEY: string;
export function getLanguage(): Language;
export function getLocale(): 'id-ID' | 'en-GB';
export function subscribeLanguage(listener: () => void): () => void;
export function setLanguage(language: Language): void;
export function t(source: string, language?: Language): string;
export function localizeDocument(doc?: Document): () => void;
