import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Spinner } from '../components/ui/Loading';
import { useAuth } from '../hooks/useAuth';
import { completeSocialLogin } from '../services/authService';
import type { User } from '../types/auth';

const TUTOR_ROLES = ['supervisor', 'admin', 'instructor'];

/** Survives React Strict Mode remount so the one-time OAuth code is not exchanged twice. */
const processedOAuthCodes = new Set<string>();

function dashboardPath(user: User): string {
  return TUTOR_ROLES.includes(user.role) ? '/tutor/dashboard' : '/dashboard';
}

const SocialAuthCallback: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { applySession } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const oauthError = params.get('error_description') || params.get('error');
    const provider = location.pathname.includes('google') ? 'google' : 'github';

    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!code) {
      setError('No authorization code found. Please try signing in again.');
      return;
    }

    const exchangeKey = `${provider}:${code}`;
    if (processedOAuthCodes.has(exchangeKey)) {
      return;
    }
    processedOAuthCodes.add(exchangeKey);

    let cancelled = false;

    (async () => {
      try {
        const { access, refresh, user } = await completeSocialLogin(provider, code);
        if (cancelled) return;
        if (!access || !user?.role) {
          throw new Error('Invalid response from server: missing access token or user profile');
        }
        applySession(user, access, refresh);
        navigate(dashboardPath(user), { replace: true });
      } catch (err: unknown) {
        if (cancelled) return;
        const detail =
          (err as { response?: { data?: { detail?: string; non_field_errors?: string[] } } })
            ?.response?.data?.detail ||
          (err as { response?: { data?: { non_field_errors?: string[] } } })?.response?.data
            ?.non_field_errors?.[0] ||
          (err as { message?: string })?.message ||
          'Unknown error';
        setError(`Failed to complete social authentication: ${detail}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate, applySession]);

  if (error) {
    return (
      <SocialAuthError error={error} onBack={() => navigate('/login')} />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <Spinner size="xl" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Completing secure sign-in...</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Please wait while we verify your credentials.</p>
      </div>
    </div>
  );
};

function SocialAuthError({ error, onBack }: { error: string; onBack: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center border border-red-100 dark:border-red-900">
        <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Authentication Failed</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="w-full py-3 px-4 bg-[#fbbf24] hover:bg-[#d97706] text-[#020c1b] rounded-lg font-bold transition-all shadow-lg hover:shadow-[#fbbf24]/20"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}

export default SocialAuthCallback;
