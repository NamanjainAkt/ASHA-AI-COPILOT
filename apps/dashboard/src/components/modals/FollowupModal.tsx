import React, { useState, useEffect } from 'react';
import { FollowUp } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { updateFollowup } from '../../services/api';
import { X, CheckCircle, Clock, Building2, UserCheck, AlertTriangle } from 'lucide-react';

interface FollowupModalProps {
  isOpen: boolean;
  onClose: () => void;
  followup: FollowUp | null;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export const FollowupModal: React.FC<FollowupModalProps> = ({
  isOpen,
  onClose,
  followup,
  onSuccess,
  onError,
}) => {
  const { t } = useLanguage();

  const [status, setStatus] = useState<string>('pending');
  const [notes, setNotes] = useState<string>('');
  const [targetFacility, setTargetFacility] = useState<string>('phc');
  const [urgency, setUrgency] = useState<string>('immediate');
  const [assignee, setAssignee] = useState<string>('mo');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (followup) {
      setStatus(followup.status || 'pending');
      setNotes(followup.notes || '');
      setTargetFacility(followup.destination_facility || 'phc');
      setUrgency(followup.urgency || (followup.priority === 'critical' ? 'immediate' : 'urgent'));
      setAssignee(followup.assigned_to || 'mo');
    }
  }, [followup, isOpen]);

  if (!isOpen || !followup) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Merging disposition details into notes / status
      const combinedNotes = `[Facility: ${targetFacility.toUpperCase()}] [Urgency: ${urgency}] [Assignee: ${assignee}] - ${notes}`;
      await updateFollowup(followup.id, {
        status,
        notes: combinedNotes,
      });
      onSuccess(t('toastSuccess'));
      onClose();
    } catch (err: any) {
      onError(err.message || t('toastError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{t('followupModalTitle')}</h3>
              <p className="text-xs text-slate-500">
                {followup.patient_name || 'Beneficiary'} · {followup.reason}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Clinical Trigger Warning Banner */}
          <div className="p-3.5 bg-red-50 border border-red-200/80 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-clinicalDanger flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-red-900 block">{followup.reason}</span>
              <span className="text-red-700">
                {followup.screening_summary || 'Auto-flagged protocol alert from field screening.'}
              </span>
            </div>
          </div>

          {/* Target Facility Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              {t('followupLabelFacility')}
            </label>
            <select
              value={targetFacility}
              onChange={(e) => setTargetFacility(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="sub_center">{t('followupFacilitySubCenter')}</option>
              <option value="phc">{t('followupFacilityPHC')}</option>
              <option value="chc">{t('followupFacilityCHC')}</option>
              <option value="district_hospital">{t('followupFacilityDistrict')}</option>
            </select>
          </div>

          {/* Urgency Classification */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t('followupLabelUrgency')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setUrgency('immediate')}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition text-center ${
                  urgency === 'immediate'
                    ? 'bg-red-50 border-red-500 text-red-700 ring-2 ring-red-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t('followupUrgencyImmediate')}
              </button>
              <button
                type="button"
                onClick={() => setUrgency('urgent')}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition text-center ${
                  urgency === 'urgent'
                    ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t('followupUrgencyUrgent')}
              </button>
              <button
                type="button"
                onClick={() => setUrgency('routine')}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition text-center ${
                  urgency === 'routine'
                    ? 'bg-teal-50 border-teal-500 text-teal-800 ring-2 ring-teal-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t('followupUrgencyRoutine')}
              </button>
            </div>
          </div>

          {/* Assignee & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-primary" />
                {t('followupLabelAssignee')}
              </label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="mo">Medical Officer (MO)</option>
                <option value="anm">ANM Worker</option>
                <option value="asha">ASHA Worker</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t('followupLabelStatus')}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="pending">{t('followupsTabPending')}</option>
                <option value="completed">{t('followupsTabCompleted')}</option>
                <option value="cancelled">{t('followupsTabCancelled')}</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t('followupLabelNotes')}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="क्लिनिकल निर्देश / रेफरल विवरण / दवा निर्देश..."
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
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
              <CheckCircle className="w-4 h-4" />
              {isSubmitting ? t('syncing') : t('modalSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
