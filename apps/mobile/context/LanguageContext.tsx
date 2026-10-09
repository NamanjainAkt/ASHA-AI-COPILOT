import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Translations } from '../constants/translations';

export type Language = 'hi' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: typeof Translations['hi'];
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'hi',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: Translations.hi,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('hi');

  useEffect(() => {
    SecureStore.getItemAsync('user_language').then(saved => {
      if (saved === 'en' || saved === 'hi') {
        setLanguageState(saved);
      }
    }).catch(() => {});
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    SecureStore.setItemAsync('user_language', lang).catch(() => {});
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState(prev => {
      const next: Language = prev === 'hi' ? 'en' : 'hi';
      SecureStore.setItemAsync('user_language', next).catch(() => {});
      return next;
    });
  }, []);

  const t = useMemo(() => Translations[language] || Translations.hi, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage,
    t
  }), [language, setLanguage, toggleLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
