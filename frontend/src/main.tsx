import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { validateApiConfig } from './lib/apiConfig';
import { applyThemeToDocument, readStoredTheme } from './lib/theme';
import { queryClient } from './lib/queryClient';

applyThemeToDocument(readStoredTheme());
validateApiConfig();

import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
