import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import {
  confirmTwoFactor,
  disableTwoFactor,
  setupTwoFactor,
} from '../services/authService';
import { showToast } from '../lib/toast';

type Step = 'idle' | 'enroll' | 'backup' | 'disable';

const TwoFactorSettings: React.FC = () => {
  const { user, updateUser } = useAuth();
  const enabled = Boolean(user?.two_factor_enabled);
  const [step, setStep] = useState<Step>('idle');
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const resetTransient = () => {
    setOtp('');
    setPassword('');
    setSecret('');
    setQrCode('');
  };

  const handleStartSetup = async () => {
    setLoading(true);
    try {
      const data = await setupTwoFactor();
      setSecret(data.secret);
      setQrCode(data.qr_code);
      setOtp('');
      setStep('enroll');
    } catch {
      showToast({ type: 'error', message: 'Could not start two-factor setup.' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      showToast({ type: 'error', message: 'Enter the authenticator code to continue.' });
      return;
    }
    setLoading(true);
    try {
      const data = await confirmTwoFactor(otp.trim());
      updateUser({ two_factor_enabled: true });
      setBackupCodes(data.backup_codes);
      resetTransient();
      setStep('backup');
      showToast({ type: 'success', message: 'Two-factor authentication enabled.' });
    } catch {
      showToast({ type: 'error', message: 'Invalid verification code. Try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || !otp.trim()) {
      showToast({ type: 'error', message: 'Password and verification code are required.' });
      return;
    }
    setLoading(true);
    try {
      await disableTwoFactor({ password, otp: otp.trim() });
      updateUser({ two_factor_enabled: false });
      resetTransient();
      setBackupCodes([]);
      setStep('idle');
      showToast({ type: 'success', message: 'Two-factor authentication disabled.' });
    } catch {
      showToast({ type: 'error', message: 'Could not disable 2FA. Check your password and code.' });
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      showToast({ type: 'success', message: 'Backup codes copied.' });
    } catch {
      showToast({ type: 'error', message: 'Could not copy backup codes.' });
    }
  };

  return (
    <div className="settings-card">
      <div className="card-header">
        <Shield size={20} />
        <h2>Two-Factor Authentication</h2>
      </div>
      <div className="card-content">
        <p>Add an extra layer of security to your account with an authenticator app.</p>
        <p className="twofa-status">
          Status: <strong>{enabled ? 'Enabled' : 'Disabled'}</strong>
        </p>

        {step === 'idle' && !enabled && (
          <button type="button" onClick={handleStartSetup} className="btn-secondary" disabled={loading}>
            {loading ? 'Starting…' : 'Enable 2FA'}
          </button>
        )}

        {step === 'idle' && enabled && (
          <button type="button" onClick={() => setStep('disable')} className="btn-secondary" disabled={loading}>
            Disable 2FA
          </button>
        )}

        {step === 'enroll' && (
          <form className="twofa-panel" onSubmit={handleConfirm}>
            <p>Scan this QR code with your authenticator app, or enter the secret manually.</p>
            {qrCode && <img className="twofa-qr" src={qrCode} alt="Two-factor authentication QR code" />}
            <code className="twofa-secret">{secret}</code>
            <label className="twofa-label" htmlFor="twofa-setup-otp">Verification code</label>
            <input
              id="twofa-setup-otp"
              className="twofa-input"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
              disabled={loading}
            />
            <div className="twofa-actions">
              <button type="submit" className="btn-secondary" disabled={loading}>
                {loading ? 'Verifying…' : 'Confirm and enable'}
              </button>
              <button
                type="button"
                className="btn-xs"
                onClick={() => { setStep('idle'); resetTransient(); }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {step === 'backup' && (
          <div className="twofa-panel">
            <p>Store these backup codes in a safe place. Each code can be used once if you lose access to your authenticator.</p>
            <ul className="twofa-backup-codes">
              {backupCodes.map((code) => <li key={code}>{code}</li>)}
            </ul>
            <div className="twofa-actions">
              <button type="button" className="btn-secondary" onClick={copyBackupCodes}>Copy codes</button>
              <button type="button" className="btn-xs" onClick={() => { setBackupCodes([]); setStep('idle'); }}>Done</button>
            </div>
          </div>
        )}

        {step === 'disable' && (
          <form className="twofa-panel" onSubmit={handleDisable}>
            <p>Disabling 2FA requires your current password and a valid authenticator or backup code.</p>
            <label className="twofa-label" htmlFor="twofa-disable-password">Password</label>
            <input
              id="twofa-disable-password"
              className="twofa-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
            />
            <label className="twofa-label" htmlFor="twofa-disable-otp">Authenticator or backup code</label>
            <input
              id="twofa-disable-otp"
              className="twofa-input"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              autoComplete="one-time-code"
              disabled={loading}
            />
            <div className="twofa-actions">
              <button type="submit" className="btn-secondary" disabled={loading}>
                {loading ? 'Disabling…' : 'Disable 2FA'}
              </button>
              <button
                type="button"
                className="btn-xs"
                onClick={() => { setStep('idle'); resetTransient(); }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default TwoFactorSettings;
