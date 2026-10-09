import React, { useState } from 'react';
import { Worker } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { createWorker } from '../../services/api';
import { X, ShieldCheck, Save } from 'lucide-react';

interface WorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  worker?: Worker | null;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export const WorkerModal: React.FC<WorkerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
}) => {
  const { t } = useLanguage();

  const [formData, setFormData] = useState<Partial<Worker>>({
    name: '',
    role: 'asha',
    phone: '',
    village: 'Rampur',
    sub_center: 'सब-सेंटर रामपुर',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      setError(t('patientErrorNameReq'));
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await createWorker(formData);
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-primary flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">{t('workerModalTitleAdd')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('workerLabelName')}
            </label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="उदा. सुनीता दीदी (Sunita Devi)"
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('workerLabelRole')}
              </label>
              <select
                value={formData.role || 'asha'}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="asha">ASHA Worker</option>
                <option value="anm">ANM Worker</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('workerLabelPhone')}
              </label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="+91 9876543210"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('workerLabelVillage')}
            </label>
            <input
              type="text"
              value={formData.village || ''}
              onChange={(e) => setFormData({ ...formData, village: e.target.value })}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="रामपुर (Rampur)"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('workerLabelSubCenter')}
            </label>
            <input
              type="text"
              value={formData.sub_center || ''}
              onChange={(e) => setFormData({ ...formData, sub_center: e.target.value })}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="सब-सेंटर रामपुर"
            />
          </div>

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
              <Save className="w-4 h-4" />
              {isSubmitting ? t('syncing') : t('modalSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
