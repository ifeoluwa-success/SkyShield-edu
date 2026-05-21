import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getHomePathForRole } from '../lib/authRouting';
import '@/assets/css/hero.css';

import studentImage from '@/assets/images/student-image2.png';

export default function Hero() {
  const { isAuthenticated, user } = useAuth();
  const dashboardPath = user?.role ? getHomePathForRole(user.role) : '/dashboard';

  return (
    <section
      className="hero-section-new"
      style={{ backgroundImage: `url(${studentImage})` }}
    >
      <div className="hero-overlay" />

      <div className="hero-inner">

        <div className="hero-eyebrow">
          <span className="hero-eyebrow-dot" />
          <span>Aviation Cybersecurity Training</span>
        </div>

        <h1 className="main-headline">
          Train Like the<br />
          <span className="gradient-text-sky">Sky Depends On You</span>
        </h1>

        <p className="subtitle-text">
          Interactive cybersecurity simulations for pilots, air traffic controllers, and ops teams.
          Detect GPS spoofing, jamming, and breaches before they become disasters.
        </p>

        <div className="hero-buttons">
          <Link to={isAuthenticated ? dashboardPath : "/signup"} className="btn-primary-sky">
            {isAuthenticated ? "Go to Dashboard" : "Start Your First Simulation"}
          </Link>
          <Link to="/about" className="btn-get-in-touch">
            Learn More
          </Link>
        </div>

      </div>
    </section>
  );
}
