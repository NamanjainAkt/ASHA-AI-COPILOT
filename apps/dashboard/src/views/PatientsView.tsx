import React, { useState, useEffect } from 'react';
import { Patient } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { fetchPatients, exportToCSV } from '../services/api';
import { Search, Filter, Plus, Edit3, Download, ChevronLeft, ChevronRight, User, Users, Phone, MapPin, Shield } from 'lucide-react';

interface PatientsViewProps {
  onOpenPatientModal: (patient?: Patient | null) => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const PatientsView: React.FC<PatientsViewProps> = ({
  onOpenPatientModal,
  onError,
}) => {
  const { t } = useLanguage();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVillage, setSelectedVillage] = useState<string>('');
  const [selectedHamlet, setSelectedHamlet] = useState<string>('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchPatients(searchTerm, selectedVillage, 200, 0);
      setPatients(data);
    } catch (err: any) {
      onError(err.message || t('toastError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedVillage]);

  // Derived filters for villages and hamlets
  const villages = Array.from(new Set(patients.map((p) => p.village).filter((v): v is string => Boolean(v))));
  const hamlets = Array.from(new Set(patients.map((p) => p.hamlet_tola).filter((h): h is string => Boolean(h))));

  // Client-side filtering by hamlet if selected
  const filteredPatients = patients.filter((p) => {
    if (selectedHamlet && p.hamlet_tola !== selectedHamlet) return false;
    return true;
  });

  // Pagination math
  const totalRecords = filteredPatients.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleExport = () => {
    exportToCSV('ASHA_Beneficiary_Surveillance_Registry', filteredPatients);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{t('patientsTitle')}</h2>
          <p className="text-xs text-slate-500">
            Total {totalRecords} registered beneficiaries across sector
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExport}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 shadow-xs flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">{t('exportCsv')}</span>
          </button>
          <button
            onClick={() => onOpenPatientModal(null)}
            className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t('patientsAddBtn')}
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search Input with Debounce */}
        <div className="relative sm:col-span-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('patientsSearchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary bg-slate-50/50"
          />
        </div>

        {/* Village Filter */}
        <div className="relative">
          <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <select
            value={selectedVillage}
            onChange={(e) => {
              setSelectedVillage(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary bg-slate-50/50 font-medium"
          >
            <option value="">{t('patientsAllVillages')}</option>
            {villages.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Hamlet/Tola Filter */}
        <div className="relative">
          <select
            value={selectedHamlet}
            onChange={(e) => {
              setSelectedHamlet(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary bg-slate-50/50 font-medium"
          >
            <option value="">{t('patientsAllHamlets')}</option>
            {hamlets.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">{t('patientsTableHeadName')}</th>
                <th className="px-5 py-3.5">{t('patientsTableHeadContact')}</th>
                <th className="px-5 py-3.5">{t('patientsTableHeadLocation')}</th>
                <th className="px-5 py-3.5">{t('patientsTableHeadAbha')}</th>
                <th className="px-5 py-3.5 text-right">{t('patientsTableHeadActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    Loading beneficiary list...
                  </td>
                </tr>
              ) : paginatedPatients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-500">{t('patientsEmpty')}</p>
                  </td>
                </tr>
              ) : (
                paginatedPatients.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition">
                    {/* Name / Sex / Age */}
                    <td className="px-5 py-4">
                      <span className="font-bold text-slate-900 block">{p.name}</span>
                      <span className="text-xs text-slate-500 capitalize flex items-center gap-1 mt-0.5">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>{p.sex === 'female' ? t('patientSexFemale') : p.sex === 'male' ? t('patientSexMale') : t('patientSexOther')} · {p.age ? `${p.age} yrs` : 'Age N/A'}</span>
                      </span>
                    </td>

                    {/* Contact & Phone Owner */}
                    <td className="px-5 py-4">
                      <span className="text-slate-900 font-medium flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{p.phone || 'No phone'}</span>
                      </span>
                      <span className="text-xs text-slate-400 capitalize mt-0.5 block">
                        Owner: {p.phone_owner || 'Self'}
                      </span>
                    </td>

                    {/* Location: Village / Hamlet */}
                    <td className="px-5 py-4">
                      <span className="text-slate-900 font-medium flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{p.village}</span>
                      </span>
                      <span className="text-xs text-slate-500 mt-0.5 block">
                        {p.hamlet_tola || 'Main Settlement'}
                      </span>
                    </td>

                    {/* ABHA Status */}
                    <td className="px-5 py-4">
                      {p.abha_id ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Shield className="w-3 h-3 text-emerald-700" />
                          <span>ABHA: {p.abha_id}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <span>Pending Registration</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => onOpenPatientModal(p)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{t('patientsEditBtn')}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 border border-slate-200 rounded-lg bg-white"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
