import React from 'react';
import { DashboardSummary, FollowUp, Worker } from '../types';
import { useLanguage } from '../context/LanguageContext';
import {
  Users,
  ClipboardCheck,
  AlertTriangle,
  AlertOctagon,
  Clock,
  ShieldCheck,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  MapPin,
  Phone,
  Wifi,
  Calendar,
  Activity,
  UserCheck
} from 'lucide-react';

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
      {/* KPI Row - Top 4 backend-derived metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI Card 1: Total Patients */}
        <div
          onClick={() => onNavigateTab('patients')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-teal-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-primary flex items-center justify-center group-hover:bg-teal-100 transition shadow-2xs">
              <Users className="w-6 h-6" />
            </div>
            <span className="text-slate-300 group-hover:text-primary transition">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {t('kpiTotalPatients')}
          </p>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">
            {summary ? summary.total_patients : '--'}
          </p>
          <p className="text-xs text-teal-700 font-medium mt-1 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>{t('kpiTotalPatientsSub')}</span>
          </p>
        </div>

        {/* KPI Card 2: Screenings Completed */}
        <div
          onClick={() => onNavigateTab('screenings')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-sky-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center group-hover:bg-sky-100 transition shadow-2xs">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <span className="text-slate-300 group-hover:text-sky-600 transition">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {t('kpiTotalScreenings')}
          </p>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">
            {summary ? summary.total_screenings : '--'}
          </p>
          <p className="text-xs text-sky-700 font-medium mt-1 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-sky-600" />
            <span>{t('kpiTotalScreeningsSub')}</span>
          </p>
        </div>

        {/* KPI Card 3: High-Risk Triage */}
        <div
          onClick={() => onNavigateTab('triage')}
          className="bg-white rounded-2xl p-5 border border-rose-200 shadow-xs hover:shadow-md hover:border-rose-300 transition cursor-pointer group bg-rose-50/20"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center group-hover:bg-rose-200 transition shadow-2xs">
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            </div>
            <span className="text-rose-400 group-hover:text-rose-600 transition">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xs font-bold text-rose-800 uppercase tracking-wider">
            {t('kpiHighRisk')}
          </p>
          <p className="text-3xl font-extrabold text-rose-600 mt-1">
            {summary ? summary.high_priority_cases : '--'}
          </p>
          <p className="text-xs text-rose-700 font-medium mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>{t('kpiHighRiskSub')}</span>
          </p>
        </div>

        {/* KPI Card 4: Pending Follow-ups */}
        <div
          onClick={() => onNavigateTab('followups')}
          className="bg-white rounded-2xl p-5 border border-amber-200 shadow-xs hover:shadow-md hover:border-amber-300 transition cursor-pointer group bg-amber-50/20"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center group-hover:bg-amber-200 transition shadow-2xs">
              <Clock className="w-6 h-6" />
            </div>
            <span className="text-amber-400 group-hover:text-amber-800 transition">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">
            {t('kpiPendingFollowups')}
          </p>
          <p className="text-3xl font-extrabold text-amber-700 mt-1">
            {summary ? summary.pending_followups : '--'}
          </p>
          <p className="text-xs text-amber-800 font-medium mt-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-amber-700" />
            <span>{t('kpiPendingFollowupsSub')}</span>
          </p>
        </div>
      </div>

      {/* Surveillance & Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Priority Alerts Table (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{t('triageTitle')}</h2>
                <p className="text-xs text-slate-500">{t('triageSubtitle')}</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('followups')}
              className="text-xs font-bold text-primary hover:text-primaryDark flex items-center gap-1 transition px-2.5 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
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
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                      Loading triage priority queue...
                    </td>
                  </tr>
                ) : highPriorityCases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <div className="max-w-xs mx-auto text-center space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-bold text-emerald-800">{t('triageEmpty')}</p>
                        <p className="text-xs text-slate-400">All registered danger signs resolved.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  highPriorityCases.map((item) => (
                    <tr key={item.id} className="hover:bg-rose-50/20 transition">
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
                        <span className="text-slate-900 font-medium flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{item.patient_village || '—'}</span>
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{item.patient_phone || 'No phone'}</span>
                        </span>
                      </td>

                      {/* Col 3: Trigger Badge */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 shadow-2xs">
                          <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>{item.reason}</span>
                        </span>
                      </td>

                      {/* Col 4: Due Date */}
                      <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{item.due_date || 'Today'}</span>
                        </span>
                      </td>

                      {/* Col 5: Triage Action */}
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => onOpenFollowupModal(item)}
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>{t('triageBtnTriage')}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
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
              <p className="text-xs text-slate-400 py-6 text-center">No active workers found.</p>
            ) : (
              workers.map((w) => (
                <div
                  key={w.id}
                  className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-100/80 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-900 font-bold flex items-center justify-center text-xs border border-teal-200 shadow-2xs">
                      {(w.name || 'W').charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                        {w.name}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{w.village}</span>
                        <span>·</span>
                        <span>{(w.role || 'ASHA').toUpperCase()}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <Wifi className="w-2.5 h-2.5 text-emerald-600" />
                      <span>{t('workersStatusSynced')}</span>
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">
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
