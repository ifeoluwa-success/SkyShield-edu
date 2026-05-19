// src/pages/LoginPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  Lock, User, Shield, AlertCircle,
  CheckCircle, Info, Chrome, Github, Eye, EyeOff, ArrowLeft
} from 'lucide-react';
import AuthGraphic from '../components/AuthGraphic';
import { Spinner } from '../components/ui/Loading';
import '@/assets/css/AuthShared.css';
import '@/assets/css/LoginPage.css';
import { redirectToSocialLogin } from '../utils/socialAuth';

function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Login failed. Please try again.';

  const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };

  if (!axiosErr.response) {
    if (axiosErr.message?.toLowerCase().includes('network'))
      return 'Unable to reach the server. Please check your connection.';
    return axiosErr.message ?? 'Login failed. Please try again.';
  }

  const { status, data } = axiosErr.response;

  if (!data)
    return status === 401 ? 'Invalid username/email or password.' : `Login failed (error ${status ?? 'unknown'}).`;

  if (typeof data === 'string')
    return data.trim().startsWith('<') ? `Server error (${status ?? ''}).` : data;

  if (typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.detail === 'string' && d.detail) return d.detail;
    if (Array.isArray(d.non_field_errors) && d.non_field_errors.length) return String(d.non_field_errors[0]);
    const fieldMessages: string[] = [];
    for (const key of ['identifier', 'password', 'email', 'username']) {
      const val = d[key];
      if (Array.isArray(val) && val.length) fieldMessages.push(String(val[0]));
      else if (typeof val === 'string' && val) fieldMessages.push(val);
    }
    if (fieldMessages.length) return fieldMessages.join(' ');
    const anyString = Object.values(d).find(v => typeof v === 'string');
    if (anyString) return String(anyString);
  }

  if (status === 401) return 'Invalid username/email or password.';
  return 'Login failed. Please try again.';
}

const TUTOR_ROLES = ['supervisor', 'admin', 'instructor'];

const LoginPage: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState('');
  const [infoMessage, setInfoMessage]     = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading]   = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSocialLogin = (provider: 'google' | 'github') => {
    redirectToSocialLogin(provider);
  };

  const clearMessages = () => { setError(''); setInfoMessage(''); setSuccessMessage(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!identifier.trim()) { setError('Username or email address is required'); return; }
    if (!password.trim())   { setError('Password is required'); return; }
    setIsLoading(true);
    try {
      const user = await login(identifier, password);
      if (TUTOR_ROLES.includes(user.role)) navigate('/tutor/dashboard');
      else navigate('/dashboard');
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!infoMessage && !successMessage) return;
    const id = setTimeout(() => { setInfoMessage(''); setSuccessMessage(''); }, 5000);
    return () => clearTimeout(id);
  }, [infoMessage, successMessage]);

  return (
    <div className="login-page">

      {/* ── Left: simulation graphic panel ────────────────────────────────── */}
      <div className="auth-left">
        <div className="auth-left-overlay">
          <AuthGraphic />
        </div>
      </div>

      {/* ── Right: form panel ──────────────────────────────────────────────── */}
      <div className="auth-right">
        <div className="auth-form-container">

          {/* Back link */}
          <Link to="/" className="auth-back-link">
            <ArrowLeft size={16} />
            <span>Back to home</span>
          </Link>

          <div className="login-header">
            <h2>Welcome back</h2>
            <p>Sign in to continue your training</p>
          </div>

          {/* Alert banners */}
          {error && (
            <div className="alert-message alert-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button className="alert-close" onClick={() => setError('')} aria-label="Dismiss">×</button>
            </div>
          )}
          {infoMessage && (
            <div className="alert-message alert-info" role="status">
              <Info size={18} />
              <span>{infoMessage}</span>
              <button className="alert-close" onClick={() => setInfoMessage('')} aria-label="Dismiss">×</button>
            </div>
          )}
          {successMessage && (
            <div className="alert-message alert-success" role="status">
              <CheckCircle size={18} />
              <span>{successMessage}</span>
              <button className="alert-close" onClick={() => setSuccessMessage('')} aria-label="Dismiss">×</button>
            </div>
          )}

          {/* Form */}
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="identifier">
                <User size={15} />
                <span>Username or Email</span>
              </label>
              <input
                type="text"
                id="identifier"
                name="identifier"
                autoComplete="username"
                value={identifier}
                onChange={e => { setIdentifier(e.target.value); clearMessages(); }}
                placeholder="username or you@company.com"
                className="form-input"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">
                <Lock size={15} />
                <span>Password</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearMessages(); }}
                  placeholder="Enter your password"
                  className="form-input password-input"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(p => !p)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-options">
              <label className="checkbox-label">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <Link to="/forgot-password" className="forgot-link">Forgot password?</Link>
            </div>

            <button type="submit" className="login-button" disabled={isLoading}>
              {isLoading
                ? <><Spinner size="sm" className="text-[#020c1b]" /><span>Signing In…</span></>
                : <><Shield size={18} /><span>Sign In</span></>}
            </button>
          </form>

          <div className="login-divider"><span>or continue with</span></div>

          <div className="social-login">
            <button
              type="button"
              className="social-button"
              disabled={isLoading}
              onClick={() => handleSocialLogin('google')}
            >
              <Chrome size={17} /><span>Google</span>
            </button>
            <button
              type="button"
              className="social-button"
              disabled={isLoading}
              onClick={() => handleSocialLogin('github')}
            >
              <Github size={17} /><span>GitHub</span>
            </button>
          </div>

          <p className="auth-switch-link">
            Don't have an account?{' '}
            <Link to="/signup">Create one free</Link>
          </p>
        </div>
      </div>

    </div>
  );
};

export default LoginPage;
