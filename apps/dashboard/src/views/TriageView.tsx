import React from 'react';
import { DashboardSummary, FollowUp, Worker } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Users, FileText, AlertTriangle, Clock, ShieldCheck, ArrowUpRight, ArrowRight } from 'lucide-react';

interface TriageViewProps {
  summary: DashboardSummary | null;
  highPriorityCases: FollowUp[];
  workers: Worker[];
  isLoading: boolean;
  onOpenFollowupModal: (caseItem: FollowUp) => void;
  onNavigateTab: (tab: any) => void;
}

export const TriageView: React.FC<TriageViewProps> = ({
  summary,
  highPriorityCases,
  workers,
  isLoading,
  onOpenFollowupModal,
  onNavigateTab,
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      {/* KPI Row - Top 4 Metric KPI Cards with trend indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI Card 1: Total Patients */}
        <div
          onClick={() => onNavigateTab('patients')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-primary flex items-center justify-center group-hover:bg-teal-100 transition">
              <Users className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> +12%
            </span>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {t('kpiTotalPatients')}
          </p>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">
            {summary ? summary.total_patients : '--'}
          </p>
          <p className="text-xs text-teal-700 font-medium mt-1">
            {t('kpiTotalPatientsSub')}
          </p>
        </div>

        {/* KPI Card 2: Screenings Completed */}
        <div
          onClick={() => onNavigateTab('screenings')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> +8%
            </span>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {t('kpiTotalScreenings')}
          </p>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">
            {summary ? summary.total_screenings : '--'}
          </p>
          <p className="text-xs text-blue-600 font-medium mt-1">
            {t('kpiTotalScreeningsSub')}
          </p>
        </div>

        {/* KPI Card 3: High-Risk Triage */}
        <div
          onClick={() => onNavigateTab('triage')}
          className="bg-white rounded-2xl p-5 border border-red-200 shadow-xs hover:shadow-md transition cursor-pointer group bg-red-50/20"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-red-100 text-clinicalDanger flex items-center justify-center group-hover:bg-red-200 transition">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-full animate-pulse">
              Urgent
            </span>
          </div>
          <p className="text-xs font-bold text-red-800 uppercase tracking-wider">
            {t('kpiHighRisk')}
          </p>
          <p className="text-3xl font-extrabold text-red-600 mt-1">
            {summary ? summary.high_priority_cases : '--'}
          </p>
          <p className="text-xs text-red-700 font-medium mt-1">
            {t('kpiHighRiskSub')}
          </p>
        </div>

        {/* KPI Card 4: Pending Follow-ups */}
        <div
          onClick={() => onNavigateTab('followups')}
          className="bg-white rounded-2xl p-5 border border-amber-200 shadow-xs hover:shadow-md transition cursor-pointer group bg-amber-50/20"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center group-hover:bg-amber-200 transition">
              <Clock className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">
              Scheduled
            </span>
          </div>
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">
            {t('kpiPendingFollowups')}
          </p>
          <p className="text-3xl font-extrabold text-amber-700 mt-1">
            {summary ? summary.pending_followups : '--'}
          </p>
          <p className="text-xs text-amber-800 font-medium mt-1">
            {t('kpiPendingFollowupsSub')}
          </p>
        </div>
      </div>

      {/* Surveillance & Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Priority Alerts Table (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-clinicalDanger" />
              <div>
                <h2 className="text-base font-bold text-slate-900">{t('triageTitle')}</h2>
                <p className="text-xs text-slate-500">{t('triageSubtitle')}</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('followups')}
              className="text-xs font-bold text-primary hover:text-primaryDark flex items-center gap-1 transition"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">{t('triageTableBeneficiary')}</th>
                  <th className="px-5 py-3">{t('triageTableLocation')}</th>
                  <th className="px-5 py-3">{t('triageTableTrigger')}</th>
                  <th className="px-5 py-3">{t('triageTableDueDate')}</th>
                  <th className="px-5 py-3 text-right">{t('triageTableAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                      Loading triage priority queue...
                    </td>
                  </tr>
                ) : highPriorityCases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center">
                      <div className="max-w-xs mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                          ✓
                        </div>
                        <p className="text-sm font-bold text-emerald-800">{t('triageEmpty')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  highPriorityCases.map((item) => (
                    <tr key={item.id} className="hover:bg-red-50/20 transition">
                      {/* Col 1: Beneficiary */}
                      <td className="px-5 py-4">
                        <span className="font-bold text-slate-900 block">
                          {item.patient_name || 'Beneficiary'}
                        </span>
                        <span className="text-xs text-slate-500 uppercase font-semibold">
                          {item.screening_type || 'NCD'} Screening
                        </span>
                      </td>

                      {/* Col 2: Village / Phone */}
                      <td className="px-5 py-4">
                        <span className="text-slate-900 block font-medium">
                          {item.patient_village || 'Rampur'}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.patient_phone || 'No phone'}
                        </span>
                      </td>

                      {/* Col 3: Trigger Badge */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                          {item.reason}
                        </span>
                      </td>

                      {/* Col 4: Due Date */}
                      <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                        {item.due_date || 'Today'}
                      </td>

                      {/* Col 5: Triage Action */}
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => onOpenFollowupModal(item)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                        >
                          {t('triageBtnTriage')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Worker Status Column (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="text-base font-bold text-slate-900">{t('workersGridTitle')}</h2>
            </div>
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
              {workers.length} Active
            </span>
          </div>

          <div className="space-y-3">
            {workers.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No active workers found.</p>
            ) : (
              workers.map((w) => (
                <div
                  key={w.id}
                  className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-100/80 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-900 font-bold flex items-center justify-center text-xs border border-teal-200">
                      {(w.name || 'W').charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                        {w.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {w.village} · {(w.role || 'ASHA').toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {t('workersStatusSynced')}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {w.screening_count ?? 0} records
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
