import { Toaster } from 'react-hot-toast';
import '../assets/css/Toast.css';

const toasterStyle = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-color)',
  boxShadow: 'var(--shadow-lg)',
  fontSize: '0.875rem',
  maxWidth: '380px',
} as const;

export default function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      containerClassName="toast-container"
      toastOptions={{
        duration: 5000,
        style: toasterStyle,
        success: {
          iconTheme: { primary: 'var(--success)', secondary: 'var(--bg-elevated)' },
        },
        error: {
          iconTheme: { primary: 'var(--danger)', secondary: 'var(--bg-elevated)' },
        },
      }}
    />
  );
}
