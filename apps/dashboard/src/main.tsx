import React from 'react';
import ReactDOM from 'react-dom/client';
import { LanguageProvider } from './context/LanguageContext';
import { AppContent } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  </React.StrictMode>
);
