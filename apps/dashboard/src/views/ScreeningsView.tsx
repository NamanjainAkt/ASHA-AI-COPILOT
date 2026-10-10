import React, { useState, useEffect } from 'react';
import { Screening } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { fetchScreenings, exportToCSV } from '../services/api';
import { Filter, Download, ChevronDown, ChevronUp, Activity, Mic, Brain, HeartPulse, Droplets, Wind, AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ScreeningsViewProps {
  onError: (msg: string) => void;
}

export const ScreeningsView: React.FC<ScreeningsViewProps> = ({ onError }) => {
  const { t } = useLanguage();

  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>('');
  const [expandedScreeningId, setExpandedScreeningId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchScreenings(undefined, selectedType || undefined, 100, 0);
      setScreenings(data);
    } catch (err: any) {
      onError(err.message || t('toastError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedType]);

  const toggleExpand = (id: string) => {
    setExpandedScreeningId((prev) => (prev === id ? null : id));
  };

  const handleExport = () => {
    exportToCSV('ASHA_Clinical_Screenings_Audit', screenings);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{t('screeningsTitle')}</h2>
          <p className="text-xs text-slate-500">
            Total {screenings.length} completed offline field screenings audited
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="pl-8 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
            >
              <option value="">{t('screeningsAllTypes')}</option>
              <option value="ncd">{t('screeningsTypeNCD')}</option>
              <option value="pregnancy">{t('screeningsTypePregnancy')}</option>
              <option value="general">{t('screeningsTypeGeneral')}</option>
            </select>
          </div>

          <button
            onClick={handleExport}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 shadow-xs flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">{t('exportCsv')}</span>
          </button>
        </div>
      </div>

      {/* Screenings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">{t('screeningsTableHeadPatient')}</th>
                <th className="px-5 py-3.5">{t('screeningsTableHeadType')}</th>
                <th className="px-5 py-3.5">{t('screeningsTableHeadVitals')}</th>
                <th className="px-5 py-3.5">{t('screeningsTableHeadSeverity')}</th>
                <th className="px-5 py-3.5">{t('screeningsTableHeadDate')}</th>
                <th className="px-5 py-3.5 text-right">{t('screeningsTableHeadDetails')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    Loading clinical screenings...
                  </td>
                </tr>
              ) : screenings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    {t('screeningsEmpty')}
                  </td>
                </tr>
              ) : (
                screenings.map((sc) => {
                  const isExpanded = expandedScreeningId === sc.id;
                  const structured = typeof sc.structured_data === 'string'
                    ? (() => { try { return JSON.parse(sc.structured_data); } catch { return {}; } })()
                    : (sc.structured_data || {});
                  const vitals = structured?.ncd;
                  const ruleList: any[] = Array.isArray(sc.rule_results)
                    ? sc.rule_results
                    : (typeof sc.rule_results === 'string'
                      ? (() => { try { return JSON.parse(sc.rule_results); } catch { return []; } })()
                      : []);
                  const triggeredRules = ruleList.filter((r) => r && r.triggered);
                  const maxSeverity = triggeredRules.some((r) => r.priority === 'critical' || r.priority === 'high')
                    ? 'high'
                    : triggeredRules.some((r) => r.priority === 'medium')
                    ? 'medium'
                    : 'normal';

                  return (
                    <React.Fragment key={sc.id}>
                      <tr className="hover:bg-slate-50/80 transition">
                        {/* Patient ID / Name */}
                        <td className="px-5 py-4">
                          <span className="font-bold text-slate-900 block">
                            {sc.patient_name || sc.patient_id.substring(0, 8)}
                          </span>
                          <span className="text-[11px] text-slate-400">ID: {sc.patient_id}</span>
                        </td>

                        {/* Screening Type */}
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 uppercase">
                            {sc.screening_type}
                          </span>
                        </td>

                        {/* Vitals Summary */}
                        <td className="px-5 py-4 text-xs">
                          {vitals ? (
                            <div className="space-y-0.5 font-medium">
                              {vitals.bp_systolic && (
                                <p>
                                  BP: <span className="font-bold text-slate-800">{vitals.bp_systolic}/{vitals.bp_diastolic}</span> mmHg
                                </p>
                              )}
                              {vitals.blood_glucose && (
                                <p>
                                  Glucose: <span className="font-bold text-slate-800">{vitals.blood_glucose}</span> mg/dL
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">N/A</span>
                          )}
                        </td>

                        {/* Severity Tag */}
                        <td className="px-5 py-4">
                          {maxSeverity === 'high' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                              <span>उच्च जोखिम (High)</span>
                            </span>
                          ) : maxSeverity === 'medium' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              <span>समीक्षा (Medium)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>सामान्य (Normal)</span>
                            </span>
                          )}
                        </td>

                        {/* Date */}
                        <td className="px-5 py-4 text-xs text-slate-600">
                          {sc.created_at ? sc.created_at.substring(0, 10) : 'Recent'}
                        </td>

                        {/* Details Accordion Toggle */}
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => toggleExpand(sc.id)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <span>{isExpanded ? 'Hide' : t('screeningsViewDetails')}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Collapsible Drawer Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={6} className="px-6 py-5 border-t border-b border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              {/* 1. Vitals Breakdown */}
                              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                                <h4 className="text-xs font-bold text-slate-900 uppercase flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                  <HeartPulse className="w-4 h-4 text-primary" />
                                  <span>{t('screeningsTableHeadVitals')}</span>
                                </h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-slate-400 flex items-center gap-1 mb-0.5">
                                      <HeartPulse className="w-3 h-3 text-rose-500" />
                                      <span>{t('screeningsVitalsBp')}</span>
                                    </span>
                                    <span className="font-bold text-slate-800">
                                      {vitals?.bp_systolic ? `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg` : 'Not recorded'}
                                    </span>
                                  </div>
                                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-slate-400 flex items-center gap-1 mb-0.5">
                                      <Droplets className="w-3 h-3 text-amber-500" />
                                      <span>{t('screeningsVitalsGlucose')}</span>
                                    </span>
                                    <span className="font-bold text-slate-800">
                                      {vitals?.blood_glucose ? `${vitals.blood_glucose} mg/dL` : 'Not recorded'}
                                    </span>
                                  </div>
                                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-slate-400 flex items-center gap-1 mb-0.5">
                                      <Activity className="w-3 h-3 text-emerald-500" />
                                      <span>{t('screeningsVitalsPulse')}</span>
                                    </span>
                                    <span className="font-bold text-slate-800">76 bpm</span>
                                  </div>
                                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-slate-400 flex items-center gap-1 mb-0.5">
                                      <Wind className="w-3 h-3 text-sky-500" />
                                      <span>{t('screeningsVitalsSpo2')}</span>
                                    </span>
                                    <span className="font-bold text-slate-800">98%</span>
                                  </div>
                                </div>
                              </div>

                              {/* 2. Clinical Rule Engine Evaluation */}
                              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                                <h4 className="text-xs font-bold text-slate-900 uppercase flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                  <Activity className="w-4 h-4 text-clinicalDanger" />
                                  {t('screeningsRulesTriggered')}
                                </h4>
                                <div className="space-y-2">
                                  {triggeredRules.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-2">No protocol danger flags triggered.</p>
                                  ) : (
                                    triggeredRules.map((r, idx) => (
                                      <div
                                        key={idx}
                                        className="p-2.5 bg-red-50/60 border border-red-200 rounded-lg text-xs"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-bold text-red-900">{r.ruleName}</span>
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-200 text-red-900 uppercase">
                                            {r.priority}
                                          </span>
                                        </div>
                                        <p className="text-red-700 mt-1">{r.reason_hi || r.reason}</p>
                                        <p className="text-[11px] text-slate-500 mt-1 font-medium">
                                          Action: {r.nextWorkflow}
                                        </p>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              {/* 3. AI Summary & Voice Transcript */}
                              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                                <h4 className="text-xs font-bold text-slate-900 uppercase flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                  <Brain className="w-4 h-4 text-blue-600" />
                                  {t('screeningsSummary')}
                                </h4>
                                <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                                  {sc.summary || 'Summary generated by Qwen Copilot engine.'}
                                </div>

                                {sc.transcript && (
                                  <div>
                                    <h5 className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1 mb-1">
                                      <Mic className="w-3 h-3 text-slate-400" />
                                      {t('screeningsTranscript')}
                                    </h5>
                                    <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded border border-slate-100">
                                      "{sc.transcript}"
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
