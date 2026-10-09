import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { RefreshCw, User, Globe } from 'lucide-react';

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onRefresh, isRefreshing }) => {
  const { t, language, toggleLanguage } = useLanguage();

  return (
    <header className="bg-primary text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Catchment */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-800 flex items-center justify-center font-bold text-lg border border-teal-600/50 shadow-inner tracking-wider">
            आशा
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight">
                {t('appTitle')}
              </h1>
              <span className="hidden md:inline-block text-xs bg-teal-800/80 px-2 py-0.5 rounded text-teal-200 border border-teal-700">
                {t('appSubtitle')}
              </span>
            </div>
            <p className="text-xs text-teal-200 flex items-center gap-1.5">
              <span>{t('catchmentLocation')}</span>
            </p>
          </div>
        </div>

        {/* Language Toggle & User Session */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Refresh Action */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title={t('refresh')}
            className="p-2 sm:px-3 sm:py-1.5 bg-teal-700/80 hover:bg-teal-600 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border border-teal-500/40 focus:outline-none focus:ring-2 focus:ring-teal-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('refresh')}</span>
          </button>

          {/* Bilingual Toggle Engine */}
          <button
            onClick={toggleLanguage}
            className="px-2.5 py-1.5 bg-teal-800/90 hover:bg-teal-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-teal-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          >
            <Globe className="w-3.5 h-3.5 text-teal-300" />
            <span>{language === 'hi' ? 'EN' : 'हिन्दी'}</span>
          </button>

          {/* User Session Avatar */}
          <div className="flex items-center gap-2 pl-1 border-l border-teal-600/60">
            <div className="w-8 h-8 rounded-full bg-teal-800 text-teal-100 flex items-center justify-center font-bold text-xs border border-teal-500 shadow-sm">
              <User className="w-4 h-4" />
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold leading-tight text-white">{t('loggedAs')}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
