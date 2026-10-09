import React, { useState, useEffect } from 'react';
import { Patient } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { createPatient, deletePatient } from '../../services/api';
import { X, UserPlus, Save, Trash2, AlertTriangle } from 'lucide-react';

interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient?: Patient | null;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export const PatientModal: React.FC<PatientModalProps> = ({
  isOpen,
  onClose,
  patient,
  onSuccess,
  onError,
}) => {
  const { t } = useLanguage();
  const isEdit = !!patient;

  const [formData, setFormData] = useState<Partial<Patient>>({
    name: '',
    age: undefined,
    sex: 'female',
    phone: '',
    phone_owner: 'self',
    village: 'Rampur',
    hamlet_tola: '',
    household_id: '',
    relationship_head: '',
    abha_id: '',
    disability_notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (patient) {
      setFormData({
        id: patient.id,
        name: patient.name || '',
        age: patient.age ?? undefined,
        sex: patient.sex || 'female',
        phone: patient.phone || '',
        phone_owner: patient.phone_owner || 'self',
        village: patient.village || 'Rampur',
        hamlet_tola: patient.hamlet_tola || '',
        household_id: patient.household_id || '',
        relationship_head: patient.relationship_head || '',
        abha_id: patient.abha_id || '',
        disability_notes: patient.disability_notes || '',
      });
    } else {
      setFormData({
        name: '',
        age: undefined,
        sex: 'female',
        phone: '',
        phone_owner: 'self',
        village: 'Rampur',
        hamlet_tola: '',
        household_id: '',
        relationship_head: '',
        abha_id: '',
        disability_notes: '',
      });
    }
    setErrors({});
    setShowDeleteConfirm(false);
  }, [patient, isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name?.trim()) {
      errs.name = t('patientErrorNameReq');
    }
    if (formData.age === undefined || formData.age === null || isNaN(Number(formData.age))) {
      errs.age = t('patientErrorAgeReq');
    }
    if (!formData.village?.trim()) {
      errs.village = t('patientErrorVillageReq');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await createPatient(formData);
      onSuccess(isEdit ? t('toastSuccess') : t('toastSuccess'));
      onClose();
    } catch (err: any) {
      onError(err.message || t('toastError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!patient?.id) return;
    setIsSubmitting(true);
    try {
      const ok = await deletePatient(patient.id);
      if (ok) {
        onSuccess(t('toastSuccess'));
        onClose();
      } else {
        onError(t('toastError'));
      }
    } catch (err: any) {
      onError(err.message || t('toastError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-primary flex items-center justify-center font-bold">
              <UserPlus className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {isEdit ? t('patientModalTitleEdit') : t('patientModalTitleAdd')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {/* Section 1: Personal Details */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              1. {t('patientsTableHeadName')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('patientLabelName')}
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3.5 py-2 text-sm rounded-xl border ${
                    errors.name ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                  } focus:outline-none focus:ring-2 focus:ring-primary`}
                  placeholder="उदा. सुमन देवी (Suman Devi)"
                />
                {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('patientLabelAge')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={formData.age !== undefined && formData.age !== null ? formData.age : ''}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value ? Number(e.target.value) : undefined })}
                  className={`w-full px-3.5 py-2 text-sm rounded-xl border ${
                    errors.age ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                  } focus:outline-none focus:ring-2 focus:ring-primary`}
                  placeholder="28"
                />
                {errors.age && <p className="text-xs text-red-600 mt-1">{errors.age}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('patientLabelSex')}
                </label>
                <select
                  value={formData.sex || 'female'}
                  onChange={(e) => setFormData({ ...formData, sex: e.target.value as any })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="female">{t('patientSexFemale')}</option>
                  <option value="male">{t('patientSexMale')}</option>
                  <option value="other">{t('patientSexOther')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Contact & Ownership */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              2. {t('patientsTableHeadContact')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('patientLabelPhone')}
                </label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="+91 9876543210"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('patientLabelPhoneOwner')}
                </label>
                <select
                  value={formData.phone_owner || 'self'}
                  onChange={(e) => setFormData({ ...formData, phone_owner: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="self">{t('patientsPhoneSelf')}</option>
                  <option value="spouse">{t('patientsPhoneSpouse')}</option>
                  <option value="parent">{t('patientsPhoneParent')}</option>
                  <option value="neighbor">{t('patientsPhoneNeighbor')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Catchment & Location */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              3. {t('patientsTableHeadLocation')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('patientLabelVillage')}
                </label>
                <input
                  type="text"
                  value={formData.village || ''}
                  onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="रामपुर (Rampur)"
                />
                {errors.village && <p className="text-xs text-red-600 mt-1">{errors.village}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('patientLabelHamlet')}
                </label>
                <input
                  type="text"
                  value={formData.hamlet_tola || ''}
                  onChange={(e) => setFormData({ ...formData, hamlet_tola: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="पटेल टोला / Sector 3"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('patientLabelHousehold')}
                </label>
                <input
                  type="text"
                  value={formData.household_id || ''}
                  onChange={(e) => setFormData({ ...formData, household_id: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="HH-1024"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Health Identity */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              4. {t('patientsTableHeadAbha')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('patientLabelAbha')}
                </label>
                <input
                  type="text"
                  maxLength={17}
                  value={formData.abha_id || ''}
                  onChange={(e) => setFormData({ ...formData, abha_id: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="14-digit ABHA Number"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Disability / Notes
                </label>
                <input
                  type="text"
                  value={formData.disability_notes || ''}
                  onChange={(e) => setFormData({ ...formData, disability_notes: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="विशेष सहायता आवश्यकताएं"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            {isEdit ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-red-200"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                {t('modalDelete')}
              </button>
            ) : <div />}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                {t('modalCancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-primary hover:bg-primaryDark text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? t('syncing') : t('modalSave')}
              </button>
            </div>
          </div>
        </form>

        {/* Delete Confirmation Modal Overlay */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-100 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900">{t('modalDeleteConfirm')}</h4>
              <p className="text-xs text-slate-500">
                Monotonic soft delete invariant will mark this record deleted across all sync nodes.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  {t('modalCancel')}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  {isSubmitting ? t('syncing') : t('modalDelete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
