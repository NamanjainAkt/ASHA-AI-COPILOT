import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { RefreshCw, User, Globe, ShieldCheck, MapPin } from 'lucide-react';

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onRefresh, isRefreshing }) => {
  const { t, language, toggleLanguage } = useLanguage();

  return (
    <header className="bg-primary text-white sticky top-0 z-40 shadow-sm border-b border-teal-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Catchment */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-800/90 flex items-center justify-center font-bold text-base border border-teal-600/60 shadow-inner tracking-wider">
            आशा
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight">
                {t('appTitle')}
              </h1>
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] bg-teal-800/80 px-2 py-0.5 rounded-full text-teal-200 border border-teal-700 font-medium">
                <ShieldCheck className="w-3 h-3 text-teal-300" />
                {t('appSubtitle')}
              </span>
            </div>
            <p className="text-xs text-teal-200 flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3 h-3 text-teal-300/80" />
              <span>{t('catchmentLocation')}</span>
              <span className="text-teal-400">·</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Live
              </span>
            </p>
          </div>
        </div>

        {/* Controls: Refresh, Bilingual Toggle, User Session */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Refresh Action */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title={t('refresh')}
            className="p-2 sm:px-3 sm:py-1.5 bg-teal-800/80 hover:bg-teal-700 rounded-xl text-xs font-medium transition flex items-center gap-1.5 border border-teal-600/60 focus:outline-none focus:ring-2 focus:ring-teal-300 shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline font-semibold">{t('refresh')}</span>
          </button>

          {/* Bilingual Toggle Engine */}
          <button
            onClick={toggleLanguage}
            title="Switch Language"
            className="px-2.5 py-1.5 bg-teal-800/90 hover:bg-teal-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border border-teal-600/70 shadow-xs focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-teal-300" />
            <span>{language === 'hi' ? 'English' : 'हिन्दी'}</span>
          </button>

          {/* User Session Avatar */}
          <div className="flex items-center gap-2 pl-2 border-l border-teal-600/60">
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
