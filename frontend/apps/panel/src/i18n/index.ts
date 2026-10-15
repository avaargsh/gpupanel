import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readJSON } from '@/utils/storage';
import zh from './locales/zh';
import en from './locales/en';

export const SUPPORTED_LANGUAGES = [
    { value: 'zh', label: '简体中文' },
    { value: 'en', label: 'English' },
] as const;

const persistedLanguage = readJSON<{ language?: string }>('ui')?.language;
const detected = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const initialLanguage = persistedLanguage ?? detected;

i18n.use(initReactI18next).init({
    resources: {
        zh: { translation: zh },
        en: { translation: en },
    },
    lng: initialLanguage,
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'en'],
    interpolation: { escapeValue: false },
    returnNull: false,
});

export default i18n;
