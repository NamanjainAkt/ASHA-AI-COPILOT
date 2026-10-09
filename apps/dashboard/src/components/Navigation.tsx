import React from 'react';
import { TabType } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { AlertTriangle, Users, FileText, GitPullRequest, ShieldCheck } from 'lucide-react';

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  highPriorityCount?: number;
  pendingFollowupCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  highPriorityCount = 0,
  pendingFollowupCount = 0,
}) => {
  const { t } = useLanguage();

  const tabs: { id: TabType; labelKey: keyof typeof import('../i18n/translations').translations['hi']; icon: React.ReactNode; badge?: number; badgeColor?: string }[] = [
    {
      id: 'triage',
      labelKey: 'tabTriage',
      icon: <AlertTriangle className="w-4 h-4 text-clinicalDanger" />,
      badge: highPriorityCount > 0 ? highPriorityCount : undefined,
      badgeColor: 'bg-red-600 text-white animate-pulse',
    },
    {
      id: 'patients',
      labelKey: 'tabPatients',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'screenings',
      labelKey: 'tabScreenings',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'followups',
      labelKey: 'tabFollowups',
      icon: <GitPullRequest className="w-4 h-4" />,
      badge: pendingFollowupCount > 0 ? pendingFollowupCount : undefined,
      badgeColor: 'bg-amber-600 text-white',
    },
    {
      id: 'workers',
      labelKey: 'tabWorkers',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
  ];

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-16 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 sm:space-x-4 overflow-x-auto py-2 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-teal-50 text-primary border border-teal-200/80 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{t(tab.labelKey)}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-1.5 px-2 py-0.5 text-[11px] font-bold rounded-full ${tab.badgeColor}`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
