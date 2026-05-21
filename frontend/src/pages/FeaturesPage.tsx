import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getHomePathForRole } from '../lib/authRouting';
import '@/assets/css/features.css';

import featuresHero    from '@/assets/images/features-hero.jpg';
import dashboardPreview from '@/assets/images/dashboard-preview.jpg';

const categories = [
  {
    num: '01',
    title: 'Simulation Engine',
    features: [
      {
        title: 'High-Fidelity Simulation',
        description: 'Real-time, physics-based simulation of aviation cyber threats with dynamic scenario generation that matches documented real-world incidents.',
        details: ['Real-time rendering', 'Multiple threat vectors', 'Dynamic scenario generation'],
      },
      {
        title: 'Adaptive Difficulty',
        description: "AI-powered difficulty adjustment calibrated to each trainee's live performance — not a preset track, but a responsive system.",
        details: ['Machine learning algorithms', 'Personalized challenge curves', 'Progressive skill loading'],
      },
      {
        title: 'Scenario Library',
        description: 'An extensive and growing library of aviation-specific cyber threat scenarios, each built from verified field intelligence.',
        details: ['10+ pre-built scenarios', 'Custom scenario authoring', 'Continuous updates'],
      },
    ],
  },
  {
    num: '02',
    title: 'Security & Infrastructure',
    features: [
      {
        title: 'Threat Detection',
        description: 'Advanced anomaly detection for real-time identification of attack patterns and behavioral indicators across simulation sessions.',
        details: ['Pattern recognition', 'Behavioral analysis', 'Real-time alert pipeline'],
      },
      {
        title: 'Data Encryption',
        description: 'Military-grade encryption protecting all training data and communications at rest and in transit, fully GDPR compliant.',
        details: ['End-to-end encryption', 'Secure data storage', 'GDPR compliant'],
      },
      {
        title: 'Cloud Infrastructure',
        description: 'Scalable global cloud infrastructure with 99.9% guaranteed uptime and automatic scaling to match cohort demand.',
        details: ['99.9% uptime SLA', 'Global CDN delivery', 'Auto-scaling architecture'],
      },
    ],
  },
  {
    num: '03',
    title: 'Analytics & Reporting',
    features: [
      {
        title: 'Performance Analytics',
        description: 'Comprehensive analytics for skill assessment, gap analysis, and longitudinal progression tracking across every trainee and cohort.',
        details: ['Real-time metrics', 'Skill gap analysis', 'Longitudinal tracking'],
      },
      {
        title: 'Team Management',
        description: 'Role-based tools for training supervisors to monitor individuals, track group performance, and issue targeted remediation.',
        details: ['Role-based access control', 'Group performance views', 'Team reporting exports'],
      },
      {
        title: 'Real-time Alerts',
        description: 'Instant notifications for critical incidents, milestone completions, and training flag events across multiple delivery channels.',
        details: ['Configurable alert rules', 'Multi-channel delivery', 'Priority classification'],
      },
    ],
  },
];

const platformStats = [
  { value: '99.9%', label: 'Platform uptime' },
  { value: '<100ms', label: 'Response time' },
  { value: '256-bit', label: 'Encryption standard' },
  { value: 'ISO 27001', label: 'Security certification' },
];

const integrations = [
  {
    num: '01',
    title: 'Flight Systems',
    description: 'Direct integration with major flight management systems and avionics platforms used across commercial and defense aviation.',
  },
  {
    num: '02',
    title: 'Security Tools',
    description: 'Compatible with industry-standard SIEM, SOAR, and threat intelligence solutions already deployed in your environment.',
  },
  {
    num: '03',
    title: 'API Access',
    description: 'RESTful APIs for custom integrations, workflow automation, and direct LMS connectivity for enterprise deployments.',
  },
];

export default function FeaturesPage() {
  const { isAuthenticated, user } = useAuth();
  const dashboardPath = user?.role ? getHomePathForRole(user.role) : '/dashboard';

  return (
    <div className="feat-page">

      {/* ── Hero ── */}
      <section className="feat-hero" style={{ backgroundImage: `url(${featuresHero})` }}>
        <div className="feat-hero-overlay" />
        <div className="feat-hero-inner">
          <div className="feat-eyebrow">
            <span className="feat-eyebrow-dot" />
            <span>Platform Features</span>
          </div>
          <h1 className="feat-headline">
            The platform behind<br />
            <span className="feat-headline-accent">mission readiness.</span>
          </h1>
          <p className="feat-sub">
            Enterprise-grade simulation, adaptive learning, and analytics — built specifically for aviation cybersecurity professionals.
          </p>
          <div className="feat-cta-row">
            <Link to={isAuthenticated ? dashboardPath : "/signup"} className="feat-btn-primary">
              {isAuthenticated ? "Go to Dashboard" : "Get Started"}
            </Link>
            <Link to="/simulations" className="feat-btn-ghost">View Simulations</Link>
          </div>
        </div>
      </section>

      {/* ── Platform stats strip ── */}
      <div className="feat-proof">
        <div className="feat-proof-inner">
          {platformStats.map((s) => (
            <div key={s.value} className="feat-proof-stat">
              <span className="feat-proof-num">{s.value}</span>
              <span className="feat-proof-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature categories ── */}
      <section className="feat-categories">
        <div className="feat-categories-inner">
          {categories.map((cat) => (
            <div key={cat.num} className="feat-category">
              <div className="feat-cat-header">
                <span className="feat-cat-num">{cat.num}</span>
                <h2 className="feat-cat-title">{cat.title}</h2>
              </div>
              <div className="feat-cat-grid">
                {cat.features.map((f) => (
                  <div key={f.title} className="feat-card">
                    <h3 className="feat-card-title">{f.title}</h3>
                    <p className="feat-card-desc">{f.description}</p>
                    <ul className="feat-card-list">
                      {f.details.map((d) => (
                        <li key={d}>
                          <span className="feat-card-dot" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Dashboard preview ── */}
      <section className="feat-preview">
        <div className="feat-preview-inner">
          <div className="feat-preview-text">
            <h2 className="feat-preview-title">
              Built for the people<br />
              <span className="feat-preview-accent">managing readiness.</span>
            </h2>
            <p className="feat-preview-sub">
              Monitor performance, track progression, and manage training programs through a comprehensive ops dashboard designed for supervisors and administrators.
            </p>
            <ul className="feat-preview-list">
              {['Real-time analytics', 'Custom reporting', 'Team management', 'Progress tracking'].map((item) => (
                <li key={item}>
                  <span className="feat-preview-dot" />
                  {item}
                </li>
              ))}
            </ul>
            <Link to={isAuthenticated ? dashboardPath : "/signup"} className="feat-btn-primary">
              {isAuthenticated ? "Go to Dashboard" : "Explore Dashboard"}
            </Link>
          </div>
          <div className="feat-preview-image-wrap">
            <img src={dashboardPreview} alt="Dashboard interface" className="feat-preview-img" />
            <div className="feat-preview-img-overlay" />
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="feat-integrations">
        <div className="feat-integrations-inner">
          <div className="feat-integrations-header">
            <h2 className="feat-integrations-title">Integrations</h2>
            <p className="feat-integrations-sub">
              Connect with your existing aviation systems and security tooling — without rearchitecting your stack.
            </p>
          </div>
          <div className="feat-integrations-grid">
            {integrations.map((intg) => (
              <div key={intg.title} className="feat-intg-card">
                <span className="feat-intg-num">{intg.num}</span>
                <h3 className="feat-intg-title">{intg.title}</h3>
                <p className="feat-intg-desc">{intg.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
