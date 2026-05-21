import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getHomePathForRole } from '../lib/authRouting';
import '@/assets/css/UseCasesPage.css';

import useCasesHero     from '@/assets/images/use-cases-hero.jpg';
import airlineTraining  from '@/assets/images/airline-training.jpg';
import militaryTraining from '@/assets/images/military-training.jpg';
import governmentTraining from '@/assets/images/government-training.jpg';

const useCases = [
  {
    num: '01',
    title: 'Commercial Airlines',
    description: 'Airline pilots, crew, and ground staff face an expanding threat surface. SkyShield delivers scenario-based training that maps directly to commercial aviation threat intelligence.',
    image: airlineTraining,
    benefits: [
      'Reduced cyber incident response time',
      'Improved threat recognition across roles',
      'Compliance with IATA and FAA security standards',
    ],
    result: 'Major international airline reduced cybersecurity incidents by 75%',
  },
  {
    num: '02',
    title: 'Military Aviation',
    description: 'Defense personnel require training that reflects the sophistication of nation-state threats. Our classified-ready simulation framework is built for high-stakes operational environments.',
    image: militaryTraining,
    benefits: [
      'Enhanced mission security protocols',
      'Advanced multi-vector threat simulation',
      'Classified scenario handling support',
    ],
    result: 'Air force unit improved threat detection accuracy by 92%',
  },
  {
    num: '03',
    title: 'Government Agencies',
    description: 'Aviation authorities and regulatory bodies require standardized security posture across all agencies and contractors. SkyShield enables consistent, auditable training at scale.',
    image: governmentTraining,
    benefits: [
      'Standardized cross-agency security protocols',
      'Multi-stakeholder collaboration scenarios',
      'Policy development and audit support',
    ],
    result: 'Aviation authority achieved 100% compliance across all agencies',
  },
];

const sectors = [
  { name: 'Air Traffic Control',  trained: '1,200+', impact: '40% faster incident response' },
  { name: 'Airport Operations',   trained: '850+',   impact: '60% reduction in breaches' },
  { name: 'Aviation Security',    trained: '2,500+', impact: '94% threat detection rate' },
  { name: 'Flight Crews',         trained: '3,000+', impact: '85% measured skill improvement' },
];

const testimonials = [
  {
    quote: 'SkyShield transformed our cybersecurity training program. Our response times improved dramatically within the first cohort.',
    name: 'John McAllister',
    role: 'Chief Security Officer, Global Airlines',
  },
  {
    quote: 'The military-grade simulations are incredibly realistic. Our pilots are better prepared for live threat scenarios than ever before.',
    name: 'Sarah Johnson',
    role: 'Training Director, Air Force Command',
  },
];

export default function UseCasesPage() {
  const { isAuthenticated, user } = useAuth();
  const dashboardPath = user?.role ? getHomePathForRole(user.role) : '/dashboard';

  return (
    <div className="uc-page">

      {/* ── Hero ── */}
      <section className="uc-hero" style={{ backgroundImage: `url(${useCasesHero})` }}>
        <div className="uc-hero-overlay" />
        <div className="uc-hero-inner">
          <div className="uc-eyebrow">
            <span className="uc-eyebrow-dot" />
            <span>Industry Applications</span>
          </div>
          <h1 className="uc-headline">
            Where SkyShield<br />
            <span className="uc-headline-accent">gets deployed.</span>
          </h1>
          <p className="uc-sub">
            Aviation organizations worldwide use SkyShield to close the gap between theoretical cybersecurity knowledge and field-ready response capability.
          </p>
          <div className="uc-cta-row">
            <Link to={isAuthenticated ? dashboardPath : "/signup"} className="uc-btn-primary">
              {isAuthenticated ? "Go to Dashboard" : "Get Started"}
            </Link>
            <Link to="/simulations" className="uc-btn-ghost">View Simulations</Link>
          </div>
        </div>
      </section>

      {/* ── Proof strip ── */}
      <div className="uc-proof">
        <div className="uc-proof-inner">
          <div className="uc-proof-stat">
            <span className="uc-proof-num">50+</span>
            <span className="uc-proof-label">Organizations trained</span>
          </div>
          <div className="uc-proof-stat">
            <span className="uc-proof-num">10,000+</span>
            <span className="uc-proof-label">Hours of training delivered</span>
          </div>
          <div className="uc-proof-stat">
            <span className="uc-proof-num">98%</span>
            <span className="uc-proof-label">Client satisfaction rate</span>
          </div>
          <div className="uc-proof-stat">
            <span className="uc-proof-num">7+</span>
            <span className="uc-proof-label">Aviation sectors served</span>
          </div>
        </div>
      </div>

      {/* ── Sectors ── */}
      <section className="uc-sectors">
        <div className="uc-sectors-inner">
          <div className="uc-section-header">
            <h2 className="uc-section-title">By sector</h2>
            <p className="uc-section-sub">
              Specialized training across the full aviation ecosystem.
            </p>
          </div>
          <div className="uc-sectors-grid">
            {sectors.map((s) => (
              <div key={s.name} className="uc-sector-card">
                <h3 className="uc-sector-name">{s.name}</h3>
                <div className="uc-sector-stats">
                  <div className="uc-sector-stat">
                    <span className="uc-sector-num">{s.trained}</span>
                    <span className="uc-sector-lbl">trained</span>
                  </div>
                  <div className="uc-sector-impact">{s.impact}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ── */}
      <section className="uc-cases">
        <div className="uc-cases-inner">
          <div className="uc-section-header">
            <h2 className="uc-section-title">Primary use cases</h2>
            <p className="uc-section-sub">
              Tailored solutions for the sectors where the stakes are highest.
            </p>
          </div>

          <div className="uc-case-list">
            {useCases.map((c) => (
              <div key={c.num} className="uc-case-item">
                <div
                  className="uc-case-image"
                  style={{ backgroundImage: `url(${c.image})` }}
                >
                  <div className="uc-case-image-overlay" />
                </div>
                <div className="uc-case-body">
                  <div className="uc-case-top">
                    <span className="uc-case-num">{c.num}</span>
                  </div>
                  <h3 className="uc-case-title">{c.title}</h3>
                  <p className="uc-case-desc">{c.description}</p>
                  <ul className="uc-case-benefits">
                    {c.benefits.map((b) => (
                      <li key={b}>
                        <span className="uc-benefit-dot" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <div className="uc-case-result">
                    <span className="uc-result-label">Result</span>
                    <p className="uc-result-text">{c.result}</p>
                  </div>
                  <div className="uc-case-actions">
                    <Link to={isAuthenticated ? dashboardPath : "/signup"} className="uc-demo-btn">
                      {isAuthenticated ? "Go to Dashboard" : "Schedule Demo"}
                    </Link>
                    <button className="uc-story-btn">Read Full Story</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="uc-testimonials">
        <div className="uc-testimonials-inner">
          <h2 className="uc-testimonials-title">What clients say</h2>
          <div className="uc-testimonials-grid">
            {testimonials.map((t) => (
              <div key={t.name} className="uc-testimonial">
                <blockquote className="uc-testimonial-quote">"{t.quote}"</blockquote>
                <div className="uc-testimonial-author">
                  <span className="uc-author-name">{t.name}</span>
                  <span className="uc-author-role">{t.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="uc-cta">
        <div className="uc-cta-inner">
          <h2 className="uc-cta-title">
            Ready to transform<br />
            <span className="uc-cta-accent">your organization?</span>
          </h2>
          <p className="uc-cta-sub">
            Schedule a personalized demo to see how SkyShield addresses your specific aviation cybersecurity training needs.
          </p>
          <div className="uc-cta-btns">
            <Link to="/signup" className="uc-btn-primary">Schedule Demo</Link>
            <button className="uc-btn-ghost-dark">Download White Paper</button>
          </div>
        </div>
      </section>

    </div>
  );
}
