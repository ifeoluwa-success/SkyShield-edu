import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Download, Shield } from 'lucide-react';
import type { CourseCertificate } from '../../types/course';
import { getMyCertificates } from '../../services/courseService';
import { showToast } from '../../lib/toast';
import '../../assets/css/CertificationsPage.css';

function formatIssuedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

type GradeInfo = {
  letter: 'A' | 'B' | 'C';
  label: string;
  color: string;
  bg: string;
  fillClass: string;
};

function gradeFromScore(score: number): GradeInfo | null {
  if (score >= 90) {
    return {
      letter: 'A',
      label: 'Distinction',
      color: 'var(--cyan)',
      bg: 'var(--cyan-dim)',
      fillClass: '',
    };
  }
  if (score >= 80) {
    return {
      letter: 'B',
      label: 'Merit',
      color: '#7eb8d4',
      bg: 'rgba(126, 184, 212, 0.15)',
      fillClass: 'credential-score-fill--merit',
    };
  }
  if (score >= 70) {
    return {
      letter: 'C',
      label: 'Pass',
      color: 'var(--success)',
      bg: 'var(--success-dim)',
      fillClass: 'credential-score-fill--pass',
    };
  }
  return null;
}

const CornerMark: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
    <path d="M2 2 L12 2 M2 2 L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="2" cy="2" r="1.5" fill="currentColor" opacity="0.6" />
  </svg>
);

const CredentialSkeleton: React.FC<{ delay?: number }> = ({ delay = 0 }) => (
  <div className="credential-skeleton" style={{ animationDelay: `${delay}ms` }}>
    <div className="credential-skel-bar" style={{ width: '55%' }} />
    <div className="credential-skel-bar" style={{ height: 22, width: '85%' }} />
    <div className="credential-skel-bar" style={{ width: '45%' }} />
    <div className="credential-skel-bar" style={{ width: '50%' }} />
  </div>
);

interface CredentialCardProps {
  cert: CourseCertificate;
  index: number;
  isPrinting: boolean;
  onPrint: (id: string) => void;
}

const CredentialCard: React.FC<CredentialCardProps> = ({ cert, index, isPrinting, onPrint }) => {
  const grade = gradeFromScore(cert.final_score);

  return (
    <article
      className={`credential-card print-certificate ${isPrinting ? 'printing-active' : ''}`}
      style={{ animationDelay: `${index * 70}ms` }}
      data-certificate-id={cert.id}
    >
      <span className="credential-corner credential-corner--tl">
        <CornerMark />
      </span>
      <span className="credential-corner credential-corner--tr">
        <CornerMark />
      </span>
      <span className="credential-corner credential-corner--bl">
        <CornerMark />
      </span>
      <span className="credential-corner credential-corner--br">
        <CornerMark />
      </span>

      <div className="credential-card-inner">
        <p className="credential-eyebrow">Certificate of completion</p>
        <h2 className="credential-title">{cert.course_title}</h2>

        <dl className="credential-meta">
          <dt>Certificate no.</dt>
          <dd>{cert.certificate_number}</dd>
          <dt>Final score</dt>
          <dd>{cert.final_score}%</dd>
          <dt>Issued</dt>
          <dd>{formatIssuedDate(cert.issued_at)}</dd>
        </dl>

        <div className="credential-score-track" aria-hidden>
          <div
            className={`credential-score-fill ${grade?.fillClass ?? ''}`}
            style={{ width: `${Math.min(100, Math.max(0, cert.final_score))}%` }}
          />
        </div>

        <p className="credential-trainee">Awarded to {cert.trainee_username}</p>

        <div className="credential-footer cert-no-print">
          {grade ? (
            <div
              className="credential-grade"
              style={
                {
                  '--grade-color': grade.color,
                  '--grade-bg': grade.bg,
                } as React.CSSProperties
              }
            >
              <span className="credential-grade-letter">{grade.letter}</span>
              <span className="credential-grade-label">{grade.label}</span>
            </div>
          ) : (
            <span className="credential-below-threshold">Below certificate threshold</span>
          )}

          <button
            type="button"
            className="credential-print-btn"
            onClick={() => onPrint(cert.id)}
            aria-label={`Print or save certificate for ${cert.course_title}`}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            Print / Save PDF
          </button>
        </div>

        {grade ? (
          <div className="credential-grade-print" aria-hidden>
            <div
              className="credential-grade"
              style={
                {
                  '--grade-color': grade.color,
                  '--grade-bg': grade.bg,
                  width: 56,
                  height: 56,
                } as React.CSSProperties
              }
            >
              <span className="credential-grade-letter">{grade.letter}</span>
              <span className="credential-grade-label">{grade.label}</span>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
};

const CertificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState<CourseCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [printingCertificateId, setPrintingCertificateId] = useState<string | null>(null);

  const clearPrinting = useCallback(() => setPrintingCertificateId(null), []);

  useEffect(() => {
    const onAfterPrint = () => clearPrinting();
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, [clearPrinting]);

  useEffect(() => {
    if (printingCertificateId) {
      document.body.classList.add('cert-printing');
    } else {
      document.body.classList.remove('cert-printing');
    }
    return () => document.body.classList.remove('cert-printing');
  }, [printingCertificateId]);

  const loadCerts = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getMyCertificates();
      setCertificates(data);
    } catch {
      setCertificates([]);
      setLoadError(true);
      showToast({ type: 'error', message: 'Failed to load certificates.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCerts();
  }, [loadCerts]);

  const handlePrint = useCallback((certificateId: string) => {
    setPrintingCertificateId(certificateId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }, []);

  return (
    <div className="certifications-page">
{loading && (
        <>
          <header className="certifications-header cert-no-print">
            <div className="header-content">
              <h1 className="header-title">My credentials</h1>
              <p className="header-subtitle">Loading your earned certificates…</p>
            </div>
          </header>
          <div className="credentials-grid">
            <CredentialSkeleton delay={0} />
            <CredentialSkeleton delay={80} />
          </div>
        </>
      )}

      {!loading && loadError && (
        <div className="empty-state cert-no-print">
          <p>We could not load your certificates. Please try again.</p>
          <button type="button" className="export-button" onClick={() => void loadCerts()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && certificates.length === 0 && (
        <div className="credentials-empty cert-no-print">
          <div className="credentials-empty-icon">
            <Shield size={32} aria-hidden />
          </div>
          <h2>No credentials yet</h2>
          <p>Complete a course to earn your first certificate of completion.</p>
          <button type="button" className="view-certificate-btn" onClick={() => navigate('/dashboard/courses')}>
            Browse courses
          </button>
        </div>
      )}

      {!loading && !loadError && certificates.length > 0 && (
        <>
          <header className="certifications-header cert-no-print">
            <div className="header-content">
              <h1 className="header-title">My credentials</h1>
              <p className="header-subtitle">
                Official certificates for completed courses. Use Print / Save PDF to download a copy.
              </p>
            </div>
            <div className="header-actions">
              <span className="status-badge completed">
                <Award size={12} aria-hidden />
                {certificates.length} earned
              </span>
            </div>
          </header>

          <div className="credentials-band cert-no-print" aria-hidden />

          <div className="credentials-grid">
            {certificates.map((cert, i) => (
              <CredentialCard
                key={cert.id}
                cert={cert}
                index={i}
                isPrinting={printingCertificateId === cert.id}
                onPrint={handlePrint}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default CertificationsPage;
