import React from 'react';
import { Worker } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Plus, ShieldCheck, MapPin, Calendar, Smartphone } from 'lucide-react';

interface WorkersViewProps {
  workers: Worker[];
  isLoading: boolean;
  onOpenWorkerModal: () => void;
}

export const WorkersView: React.FC<WorkersViewProps> = ({
  workers,
  isLoading,
  onOpenWorkerModal,
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{t('workersTitle')}</h2>
          <p className="text-xs text-slate-500">
            Field deployment monitoring and device synchronization health
          </p>
        </div>
        <button
          onClick={onOpenWorkerModal}
          className="self-start sm:self-auto px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          {t('workersAddBtn')}
        </button>
      </div>

      {/* Grid of Workers Cards */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          Loading field workers deployment...
        </div>
      ) : workers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          {t('workersEmpty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {workers.map((w) => {
            const initials = (w.name || 'W').charAt(0);
            return (
              <div
                key={w.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition p-5 space-y-4 flex flex-col justify-between"
              >
                {/* Worker Top Info */}
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-base border border-teal-200 shadow-xs">
                        {initials}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">
                          {w.name}
                        </h3>
                        <p className="text-xs font-medium text-slate-500 uppercase mt-0.5">
                          {w.role} · {w.sub_center || 'Sub Center'}
                        </p>
                      </div>
                    </div>
                    {/* Sync Health Pill */}
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                      {t('workersStatusSynced')}
                    </span>
                  </div>

                  {/* Metadata fields */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Village: <strong className="text-slate-800">{w.village}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Device: <strong className="text-slate-800">Phone {w.id.substring(0, 6)}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Last Sync:{' '}
                        <strong className="text-slate-800">
                          {w.last_sync_time ? new Date(w.last_sync_time).toLocaleTimeString() : 'Live'}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Metrics */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">
                      {t('workersTableHeadScreenings')}
                    </span>
                    <span className="text-base font-extrabold text-primary">
                      {w.screening_count ?? 0}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">
                      Auth Level
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-600" /> Verified
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
