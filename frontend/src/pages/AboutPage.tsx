import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getHomePathForRole } from '../lib/authRouting';
import '@/assets/css/AboutPage.css';

import aboutHero    from '@/assets/images/about-hero.jpg';
import missionImage from '@/assets/images/mission-image1.jpg';
import teamPhoto    from '@/assets/images/team-photo.jpg';

const milestones = [
  {
    year: '2020',
    event: 'Company Founded',
    description: 'Initial research and development phase, assembling a core team of aviation security and simulation experts.',
  },
  {
    year: '2021',
    event: 'First Prototype',
    description: 'Beta simulation engine deployed with select aviation partners for rigorous, real-world field testing.',
  },
  {
    year: '2022',
    event: 'Platform Launch',
    description: 'Public launch with 10 high-fidelity scenarios, serving commercial airlines, defense clients, and government agencies.',
  },
  {
    year: '2023',
    event: 'Global Expansion',
    description: 'Partnerships with 50+ organizations across 7 aviation sectors. Over 2,500 professionals trained to date.',
  },
];

const leadership = [
  {
    num: '01',
    name: 'Dr. James Wilson',
    role: 'Founder & CEO',
    experience: '25+ years in aviation security',
    bio: 'Former Air Force cybersecurity expert with extensive experience in aviation threat analysis and national security operations.',
  },
  {
    num: '02',
    name: 'Sarah Chen',
    role: 'Chief Technology Officer',
    experience: '15+ years in simulation technology',
    bio: 'Architect of the Aura Adaptive Engine. Previously led simulation R&D at a leading defense contractor.',
  },
  {
    num: '03',
    name: 'Michael Rodriguez',
    role: 'Head of Training',
    experience: '20+ years in aviation training',
    bio: 'Former airline training director with deep expertise in crew resource management and threat response protocols.',
  },
];

const awards = [
  { num: '01', title: 'Aviation Innovation Award', body: 'International Aviation Association — 2023' },
  { num: '02', title: 'Cybersecurity Excellence', body: 'Global Security Council — 2022' },
  { num: '03', title: 'Best Training Platform', body: 'Education Technology Awards — 2023' },
];

export default function AboutPage() {
  const { isAuthenticated, user } = useAuth();
  const dashboardPath = user?.role ? getHomePathForRole(user.role) : '/dashboard';

  return (
    <div className="ab-page">

      {/* ── Hero ── */}
      <section className="ab-hero" style={{ backgroundImage: `url(${aboutHero})` }}>
        <div className="ab-hero-overlay" />
        <div className="ab-hero-inner">
          <div className="ab-eyebrow">
            <span className="ab-eyebrow-dot" />
            <span>Our Story</span>
          </div>
          <h1 className="ab-headline">
            Securing aviation's<br />
            <span className="ab-headline-accent">digital future.</span>
          </h1>
          <p className="ab-sub">
            SkyShield was founded with a singular mission: equip aviation professionals with the training they need to withstand the cyber threats reshaping the industry.
          </p>
          <div className="ab-cta-row">
            <Link to={isAuthenticated ? dashboardPath : "/signup"} className="ab-btn-primary">
              {isAuthenticated ? "Go to Dashboard" : "Join the Mission"}
            </Link>
            <Link to="/simulations" className="ab-btn-ghost">View Simulations</Link>
          </div>
        </div>
      </section>

      {/* ── Proof strip ── */}
      <div className="ab-proof">
        <div className="ab-proof-inner">
          <div className="ab-proof-stat">
            <span className="ab-proof-num">50+</span>
            <span className="ab-proof-label">Countries with active SkyShield deployments</span>
          </div>
          <div className="ab-proof-stat">
            <span className="ab-proof-num">2,500+</span>
            <span className="ab-proof-label">Aviation professionals trained to date</span>
          </div>
          <div className="ab-proof-stat">
            <span className="ab-proof-num">10+</span>
            <span className="ab-proof-label">Industry awards and recognitions earned</span>
          </div>
          <div className="ab-proof-stat">
            <span className="ab-proof-num">4 yrs</span>
            <span className="ab-proof-label">Operational since founding in 2020</span>
          </div>
        </div>
      </div>

      {/* ── Mission ── */}
      <section className="ab-mission">
        <div className="ab-mission-inner">
          <div className="ab-mission-text">
            <h2 className="ab-mission-title">
              Why we exist.<br />
              <span className="ab-mission-accent">What drives us.</span>
            </h2>
            <p className="ab-mission-body">
              Aviation is one of the most complex and interconnected systems on earth. As it digitizes, its attack surface expands. Most training programs lag years behind the actual threat landscape. SkyShield closes that gap — with simulation-first, field-tested methodology.
            </p>
            <ul className="ab-mission-values">
              {[
                'Mission-grade immersion over checkbox compliance',
                'Evidence-based curriculum built from real incidents',
                'Adaptive challenge that matches each professional\'s level',
                'Measurable readiness, not just course completion',
              ].map((v) => (
                <li key={v}>
                  <span className="ab-value-dot" />
                  {v}
                </li>
              ))}
            </ul>
          </div>
          <div className="ab-mission-image-wrap">
            <img src={missionImage} alt="SkyShield mission" className="ab-mission-img" />
            <div className="ab-mission-img-overlay" />
          </div>
        </div>
      </section>

      {/* ── Timeline ── */}
      <section className="ab-timeline">
        <div className="ab-timeline-inner">
          <div className="ab-section-header">
            <h2 className="ab-section-title">The journey</h2>
            <p className="ab-section-sub">Four years of building the standard.</p>
          </div>
          <div className="ab-milestone-list">
            {milestones.map((m) => (
              <div key={m.year} className="ab-milestone">
                <span className="ab-milestone-year">{m.year}</span>
                <div className="ab-milestone-body">
                  <h3 className="ab-milestone-event">{m.event}</h3>
                  <p className="ab-milestone-desc">{m.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Leadership ── */}
      <section className="ab-leadership">
        <div className="ab-leadership-inner">
          <div className="ab-section-header">
            <h2 className="ab-section-title">Leadership</h2>
            <p className="ab-section-sub">Decades of combined experience in aviation and cybersecurity.</p>
          </div>
          <div className="ab-leader-list">
            {leadership.map((l) => (
              <div key={l.num} className="ab-leader">
                <span className="ab-leader-num">{l.num}</span>
                <div className="ab-leader-info">
                  <h3 className="ab-leader-name">{l.name}</h3>
                  <span className="ab-leader-role">{l.role}</span>
                </div>
                <span className="ab-leader-exp">{l.experience}</span>
                <p className="ab-leader-bio">{l.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Team photo ── */}
      <section className="ab-team">
        <div className="ab-team-inner">
          <div className="ab-team-image-wrap">
            <img src={teamPhoto} alt="SkyShield team" className="ab-team-img" />
            <div className="ab-team-img-overlay" />
          </div>
          <div className="ab-team-text">
            <h2 className="ab-team-title">
              A diverse team<br />
              <span className="ab-team-accent">with a shared mission.</span>
            </h2>
            <p className="ab-team-body">
              We bring together aviation veterans, cybersecurity researchers, simulation engineers, and educators — united by the conviction that better-trained professionals make aviation safer for everyone.
            </p>
            <div className="ab-team-stats">
              <div className="ab-team-stat">
                <span className="ab-team-num">40+</span>
                <span className="ab-team-lbl">Team members</span>
              </div>
              <div className="ab-team-stat">
                <span className="ab-team-num">15+</span>
                <span className="ab-team-lbl">Nationalities</span>
              </div>
              <div className="ab-team-stat">
                <span className="ab-team-num">100+</span>
                <span className="ab-team-lbl">Years combined experience</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Awards ── */}
      <section className="ab-awards">
        <div className="ab-awards-inner">
          <div className="ab-section-header">
            <h2 className="ab-section-title">Recognition</h2>
            <p className="ab-section-sub">Validated by the industry.</p>
          </div>
          <div className="ab-awards-grid">
            {awards.map((a) => (
              <div key={a.num} className="ab-award-card">
                <span className="ab-award-num">{a.num}</span>
                <h3 className="ab-award-title">{a.title}</h3>
                <p className="ab-award-body">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ab-cta">
        <div className="ab-cta-inner">
          <h2 className="ab-cta-title">
            Ready to be part<br />
            <span className="ab-cta-accent">of the mission?</span>
          </h2>
          <p className="ab-cta-sub">
            Whether you're looking to train your team, partner with us, or join our organization — we'd like to hear from you.
          </p>
          <div className="ab-cta-btns">
            <Link to="/signup" className="ab-btn-primary">Get Started</Link>
            <button className="ab-btn-ghost-dark">Partner With Us</button>
          </div>
        </div>
      </section>

    </div>
  );
}
