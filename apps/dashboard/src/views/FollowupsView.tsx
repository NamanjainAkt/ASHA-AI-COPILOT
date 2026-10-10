import React, { useState, useEffect } from 'react';
import { FollowUp } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { fetchFollowups, exportToCSV } from '../services/api';
import { Download, Building2, CheckCircle2, XCircle, ArrowUpRight, AlertOctagon, AlertTriangle, Clock, MapPin } from 'lucide-react';

interface FollowupsViewProps {
  onOpenDispositionModal: (followup: FollowUp) => void;
  onError: (msg: string) => void;
}

export const FollowupsView: React.FC<FollowupsViewProps> = ({
  onOpenDispositionModal,
  onError,
}) => {
  const { t } = useLanguage();

  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeStatusTab, setActiveStatusTab] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchFollowups(
        activeStatusTab === 'all' ? undefined : activeStatusTab,
        selectedPriority === 'all' ? undefined : selectedPriority,
        100,
        0
      );
      setFollowups(data);
    } catch (err: any) {
      onError(err.message || t('toastError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeStatusTab, selectedPriority]);

  const handleExport = () => {
    exportToCSV('ASHA_Referrals_and_Followups_Tracker', followups);
  };

  const statusTabs = [
    { id: 'all', labelKey: 'followupsTabAll' as const },
    { id: 'pending', labelKey: 'followupsTabPending' as const },
    { id: 'completed', labelKey: 'followupsTabCompleted' as const },
    { id: 'cancelled', labelKey: 'followupsTabCancelled' as const },
  ];

  const priorityChips = [
    { id: 'all', labelKey: 'followupsPriorityAll' as const, color: 'bg-slate-100 text-slate-700', icon: null },
    { id: 'critical', labelKey: 'followupsPriorityCritical' as const, color: 'bg-rose-100 text-rose-800 border-rose-200', icon: AlertOctagon },
    { id: 'high', labelKey: 'followupsPriorityHigh' as const, color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertTriangle },
    { id: 'medium', labelKey: 'followupsPriorityMedium' as const, color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
    { id: 'low', labelKey: 'followupsPriorityLow' as const, color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{t('followupsTitle')}</h2>
          <p className="text-xs text-slate-500">
            Total {followups.length} clinical referral cases in pipeline
          </p>
        </div>
        <button
          onClick={handleExport}
          className="self-start sm:self-auto px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>{t('exportCsv')}</span>
        </button>
      </div>

      {/* Tabs & Priority Filter Row */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveStatusTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeStatusTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Priority Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {priorityChips.map((chip) => {
            const IconComponent = chip.icon;
            return (
              <button
                key={chip.id}
                onClick={() => setSelectedPriority(chip.id)}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition border cursor-pointer ${
                  selectedPriority === chip.id
                    ? `${chip.color} border-current ring-1 ring-current shadow-2xs`
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {IconComponent && <IconComponent className="w-3 h-3 shrink-0" />}
                <span>{t(chip.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Referrals Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">{t('followupsTableHeadPatient')}</th>
                <th className="px-5 py-3.5">{t('followupsTableHeadReason')}</th>
                <th className="px-5 py-3.5">{t('followupsTableHeadPriority')}</th>
                <th className="px-5 py-3.5">{t('followupsTableHeadDueDate')}</th>
                <th className="px-5 py-3.5">{t('followupsTableHeadFacility')}</th>
                <th className="px-5 py-3.5">{t('followupsTableHeadReached')}</th>
                <th className="px-5 py-3.5 text-right">{t('followupsTableHeadAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Loading referrals list...
                  </td>
                </tr>
              ) : followups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    {t('followupsEmpty')}
                  </td>
                </tr>
              ) : (
                followups.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/80 transition">
                    {/* Patient */}
                    <td className="px-5 py-4">
                      <span className="font-bold text-slate-900 block">
                        {f.patient_name || f.patient_id.substring(0, 8)}
                      </span>
                      <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{f.patient_village || '—'}</span>
                      </span>
                    </td>

                    {/* Reason */}
                    <td className="px-5 py-4">
                      <span className="font-medium text-slate-800 block">{f.reason}</span>
                      {f.notes && (
                        <span className="text-[11px] text-slate-400 block truncate max-w-xs mt-0.5">
                          {f.notes}
                        </span>
                      )}
                    </td>

                    {/* Priority Badge */}
                    <td className="px-5 py-4">
                      {f.priority === 'critical' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                          <span>Critical</span>
                        </span>
                      ) : f.priority === 'high' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>High</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span className="capitalize">{f.priority}</span>
                        </span>
                      )}
                    </td>

                    {/* Due Date */}
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{f.due_date}</span>
                      </span>
                    </td>

                    {/* Destination Facility */}
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                        <span>{(f.destination_facility || '—').toUpperCase()}</span>
                      </span>
                    </td>

                    {/* Facility Reached? */}
                    <td className="px-5 py-4">
                      {f.facility_reached ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('followupsReachedYes')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                          <XCircle className="w-3.5 h-3.5 text-slate-400" />
                          <span>{t('followupsReachedNo')}</span>
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => onOpenDispositionModal(f)}
                        className="px-3.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 border border-teal-200 cursor-pointer shadow-2xs"
                      >
                        <span>{t('followupsDispositionBtn')}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
