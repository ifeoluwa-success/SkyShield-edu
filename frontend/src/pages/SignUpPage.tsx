import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../services/authService';
import { Lock, Mail, User, Shield, Briefcase, Check, ArrowLeft } from 'lucide-react';
import AuthGraphic from '../components/AuthGraphic';
import '@/assets/css/AuthShared.css';
import '@/assets/css/SignUpPage.css';
import { redirectToSocialLogin } from '../utils/socialAuth';

interface FormData {
  email: string;
  username: string;
  password: string;
  password2: string;
  first_name: string;
  last_name: string;
  organization: string;
  job_title: string;
}

interface Errors {
  email?: string;
  username?: string;
  password?: string;
  password2?: string;
  first_name?: string;
  last_name?: string;
  organization?: string;
  job_title?: string;
  general?: string;
}

type RegisterErrorShape = Partial<Record<keyof Errors, string>> & { detail?: string };

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
    email: '', username: '', password: '', password2: '',
    first_name: '', last_name: '', organization: '', job_title: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSocialLogin = (provider: 'google' | 'github') => {
    redirectToSocialLogin(provider);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (errors[name as keyof Errors]) setErrors({ ...errors, [name]: '' });
  };

  const validateForm = (): boolean => {
    const newErrors: Errors = {};
    if (!formData.email)    newErrors.email    = 'Email is required';
    if (!formData.username) newErrors.username  = 'Username is required';
    if (!formData.password) newErrors.password  = 'Password is required';
    if (formData.password !== formData.password2) newErrors.password2 = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      await register(formData);
      navigate('/login', { state: { message: 'Registration successful! Please verify your email.' } });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      if (data && typeof data === 'object') setErrors(data as RegisterErrorShape);
      else setErrors({ general: 'Registration failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="signup-page">

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

          <div className="signup-header">
            <h2>Create your account</h2>
            <p>Fill in your details to get started for free</p>
          </div>

          {errors.general && (
            <div className="error-message">{errors.general}</div>
          )}

          <form className="signup-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="first_name"><User size={15} /><span>First Name</span></label>
                <input type="text" id="first_name" name="first_name" value={formData.first_name}
                  onChange={handleChange} placeholder="John" className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="last_name"><User size={15} /><span>Last Name</span></label>
                <input type="text" id="last_name" name="last_name" value={formData.last_name}
                  onChange={handleChange} placeholder="Doe" className="form-input" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="username"><User size={15} /><span>Username</span></label>
              <input type="text" id="username" name="username" value={formData.username}
                onChange={handleChange} placeholder="johndoe" className="form-input" />
              {errors.username && <span className="error-text">{errors.username}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="email"><Mail size={15} /><span>Email Address</span></label>
              <input type="email" id="email" name="email" value={formData.email}
                onChange={handleChange} placeholder="you@company.com" className="form-input" />
              {errors.email && <span className="error-text">{errors.email}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="organization"><Briefcase size={15} /><span>Company / Organization</span></label>
              <input type="text" id="organization" name="organization" value={formData.organization}
                onChange={handleChange} placeholder="Aviation Corp Inc." className="form-input" />
            </div>

            <div className="form-group">
              <label htmlFor="job_title"><User size={15} /><span>Professional Role</span></label>
              <select id="job_title" name="job_title" value={formData.job_title}
                onChange={handleChange} className="form-input">
                <option value="">Select your role</option>
                <option value="pilot">Pilot</option>
                <option value="atc">Air Traffic Controller</option>
                <option value="operations">Operations Officer</option>
                <option value="security">Security Specialist</option>
                <option value="manager">Manager / Supervisor</option>
                <option value="student">Student / Trainee</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="password"><Lock size={15} /><span>Password</span></label>
                <input type="password" id="password" name="password" value={formData.password}
                  onChange={handleChange} placeholder="Create password" className="form-input" />
                {errors.password && <span className="error-text">{errors.password}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="password2"><Lock size={15} /><span>Confirm Password</span></label>
                <input type="password" id="password2" name="password2" value={formData.password2}
                  onChange={handleChange} placeholder="Confirm password" className="form-input" />
                {errors.password2 && <span className="error-text">{errors.password2}</span>}
              </div>
            </div>

            <div className="password-requirements">
              <p className="requirements-title">Password must include:</p>
              <ul className="requirements-list">
                <li className="requirement-item"><Check size={13} /><span>At least 8 characters</span></li>
                <li className="requirement-item"><Check size={13} /><span>One uppercase letter</span></li>
                <li className="requirement-item"><Check size={13} /><span>One number</span></li>
                <li className="requirement-item"><Check size={13} /><span>One special character</span></li>
              </ul>
            </div>

            <div className="terms-group">
              <label className="checkbox-label">
                <input type="checkbox" required />
                <span>I agree to the <a href="/terms" className="terms-link">Terms of Service</a> and <a href="/privacy" className="terms-link">Privacy Policy</a></span>
              </label>
            </div>

            <div className="terms-group">
              <label className="checkbox-label">
                <input type="checkbox" />
                <span>Subscribe to cybersecurity updates and training tips</span>
              </label>
            </div>

            <button type="submit" className="signup-button" disabled={isLoading}>
              <Shield size={18} />
              <span>{isLoading ? 'Creating Account…' : 'Create Account'}</span>
            </button>
          </form>

          <div className="signup-divider"><span>or sign up with</span></div>

          <div className="social-signup">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleSocialLogin('google')}
            >
              Google
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleSocialLogin('github')}
            >
              GitHub
            </button>
          </div>

          <p className="auth-switch-link">
            Already have an account?{' '}
            <Link to="/login">Sign in here</Link>
          </p>
        </div>
      </div>

    </div>
  );
};

export default SignUpPage;
