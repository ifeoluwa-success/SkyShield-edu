/** OAuth redirect helpers — callback URL must match backend FRONTEND_URL. */

export type SocialProvider = 'google' | 'github';

export function getFrontendOrigin(): string {
  const configured = import.meta.env.VITE_FRONTEND_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:5173';
}

export function getSocialCallbackUrl(provider: SocialProvider): string {
  return `${getFrontendOrigin()}/auth/callback/${provider}`;
}

export function redirectToSocialLogin(provider: SocialProvider): void {
  const callbackUrl = encodeURIComponent(getSocialCallbackUrl(provider));

  if (provider === 'google') {
    const clientId =
      import.meta.env.VITE_GOOGLE_CLIENT_ID ||
      '286908192296-i36j9p9lql614ilg6bjtap02hprfgikh.apps.googleusercontent.com';
    const scope = encodeURIComponent('profile email');
    window.location.href =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}` +
      `&redirect_uri=${callbackUrl}&response_type=code&scope=${scope}&prompt=select_account`;
    return;
  }

  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || 'Ov23lixgmLpdpnwvA1Q5';
  const scope = encodeURIComponent('user:email');
  window.location.href =
    `https://github.com/login/oauth/authorize?client_id=${clientId}` +
    `&redirect_uri=${callbackUrl}&scope=${scope}`;
}
