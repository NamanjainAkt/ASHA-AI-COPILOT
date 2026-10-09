import React, { useState, useEffect, useRef } from 'react';
import { TabType, DashboardSummary, FollowUp, Worker, Patient } from './types';
import { useLanguage } from './context/LanguageContext';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { ToastContainer, ToastMessage } from './components/Toast';
import { PatientModal } from './components/modals/PatientModal';
import { FollowupModal } from './components/modals/FollowupModal';
import { WorkerModal } from './components/modals/WorkerModal';
import { TriageView } from './views/TriageView';
import { PatientsView } from './views/PatientsView';
import { ScreeningsView } from './views/ScreeningsView';
import { FollowupsView } from './views/FollowupsView';
import { WorkersView } from './views/WorkersView';
import { fetchDashboardSummary, fetchHighPriorityCases, fetchDashboardWorkers } from './services/api';

export const AppContent: React.FC = () => {
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<TabType>('triage');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [highPriorityCases, setHighPriorityCases] = useState<FollowUp[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false);
  const [selectedFollowup, setSelectedFollowup] = useState<FollowUp | null>(null);

  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);

  // Toast notifications state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const prevHighPriorityCount = useRef<number>(0);

  const addToast = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Central refresh logic
  const loadDashboardData = async (isManual = false) => {
    if (document.hidden && !isManual) return; // Pause polling when tab is backgrounded
    if (isManual) setIsRefreshing(true);
    try {
      const [sum, hp, wrks] = await Promise.all([
        fetchDashboardSummary(),
        fetchHighPriorityCases(),
        fetchDashboardWorkers(),
      ]);

      setSummary(sum);
      setHighPriorityCases(hp);
      setWorkers(wrks);

      // Check for newly arrived critical emergency cases
      if (hp.length > prevHighPriorityCount.current && prevHighPriorityCount.current > 0) {
        addToast('warning', t('toastNewCritical'));
      }
      prevHighPriorityCount.current = hp.length;
    } catch (err: any) {
      console.warn('Dashboard poll error:', err);
    } finally {
      setIsLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  };

  // Task 1.12: Live polling every 15s with visibility pause
  useEffect(() => {
    loadDashboardData();

    const interval = setInterval(() => {
      loadDashboardData();
    }, 15000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadDashboardData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleOpenPatientModal = (patient?: Patient | null) => {
    setEditingPatient(patient || null);
    setIsPatientModalOpen(true);
  };

  const handleOpenFollowupModal = (followup: FollowUp) => {
    setSelectedFollowup(followup);
    setIsFollowupModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Header Shell */}
      <Header
        onRefresh={() => loadDashboardData(true)}
        isRefreshing={isRefreshing}
        highPriorityCount={summary?.high_priority_cases}
      />

      {/* Primary Navigation Bar */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        highPriorityCount={summary?.high_priority_cases}
        pendingFollowupCount={summary?.pending_followups}
      />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'triage' && (
          <TriageView
            summary={summary}
            highPriorityCases={highPriorityCases}
            workers={workers}
            isLoading={isLoading}
            onOpenFollowupModal={handleOpenFollowupModal}
            onNavigateTab={(t) => setActiveTab(t)}
          />
        )}

        {activeTab === 'patients' && (
          <PatientsView
            onOpenPatientModal={handleOpenPatientModal}
            onSuccess={(msg) => {
              addToast('success', msg);
              loadDashboardData();
            }}
            onError={(msg) => addToast('error', msg)}
          />
        )}

        {activeTab === 'screenings' && (
          <ScreeningsView onError={(msg) => addToast('error', msg)} />
        )}

        {activeTab === 'followups' && (
          <FollowupsView
            onOpenDispositionModal={handleOpenFollowupModal}
            onError={(msg) => addToast('error', msg)}
          />
        )}

        {activeTab === 'workers' && (
          <WorkersView
            workers={workers}
            isLoading={isLoading}
            onOpenWorkerModal={() => setIsWorkerModalOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        {t('footerText')}
      </footer>

      {/* Interactive Modals */}
      <PatientModal
        isOpen={isPatientModalOpen}
        onClose={() => setIsPatientModalOpen(false)}
        patient={editingPatient}
        onSuccess={(msg) => {
          addToast('success', msg);
          loadDashboardData();
        }}
        onError={(msg) => addToast('error', msg)}
      />

      <FollowupModal
        isOpen={isFollowupModalOpen}
        onClose={() => setIsFollowupModalOpen(false)}
        followup={selectedFollowup}
        onSuccess={(msg) => {
          addToast('success', msg);
          loadDashboardData();
        }}
        onError={(msg) => addToast('error', msg)}
      />

      <WorkerModal
        isOpen={isWorkerModalOpen}
        onClose={() => setIsWorkerModalOpen(false)}
        onSuccess={(msg) => {
          addToast('success', msg);
          loadDashboardData();
        }}
        onError={(msg) => addToast('error', msg)}
      />

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};
