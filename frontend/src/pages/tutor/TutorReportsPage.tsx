import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Download, Eye, Calendar, Filter, Search, Plus, X, FolderOpen
} from 'lucide-react';
import { getReports, generateReport, deleteReport, downloadReport } from '../../services/tutorService';
import type { Report } from '../../types/tutor';
import { showToast } from '../../lib/toast';
import { PageLoader, Spinner } from '../../components/ui/Loading';
import '../../assets/css/TutorReports.css';

const TutorReportsPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newReport, setNewReport] = useState({
    title: '',
    type: 'student_performance',
    date_range: { start: '', end: '' },
  });

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (searchTerm) params.search = searchTerm;
      if (filterType) params.type = filterType;
      const data = await getReports(params);
      setReports(data);
    } catch {
      showToast({ type: 'error', message: 'Failed to load reports' });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterType]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReport.title.trim()) {
      showToast({ type: 'error', message: 'Please enter a report title' });
      return;
    }
    setGenerating(true);
    try {
      const report = await generateReport({
        title: newReport.title,
        type: newReport.type,
        date_range: newReport.date_range.start && newReport.date_range.end
          ? { start: newReport.date_range.start, end: newReport.date_range.end }
          : undefined,
      });
      setReports(prev => [report, ...prev]);
      showToast({ type: 'success', message: 'Report generated successfully' });
      setShowGenerateModal(false);
      setNewReport({ title: '', type: 'student_performance', date_range: { start: '', end: '' } });
    } catch {
      showToast({ type: 'error', message: 'Failed to generate report' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this report permanently?')) return;
    try {
      await deleteReport(id);
      setReports(prev => prev.filter(r => r.id !== id));
      showToast({ type: 'success', message: 'Report deleted' });
    } catch {
      showToast({ type: 'error', message: 'Failed to delete report' });
    }
  };

  const handleDownload = async (report: Report) => {
    try {
      const blob = await downloadReport(report.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch {
      showToast({ type: 'error', message: 'Failed to download report' });
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'student_performance': return 'Student Performance';
      case 'exercise_analytics': return 'Exercise Analytics';
      case 'quarterly_review': return 'Quarterly Review';
      case 'content_analysis': return 'Content Analysis';
      default: return type;
    }
  };

  return (
    <div className="tutor-reports-page">
<div className="page-header">
        <div className="header-content">
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Generate and manage performance reports</p>
        </div>
        <button className="primary-button" onClick={() => setShowGenerateModal(true)}>
          <Plus size={20} />
          <span>Generate New Report</span>
        </button>
      </div>

      <div className="content-card">
        <div className="search-filter-bar">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-options">
            <select
              className="type-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="student_performance">Student Performance</option>
              <option value="exercise_analytics">Exercise Analytics</option>
              <option value="quarterly_review">Quarterly Review</option>
              <option value="content_analysis">Content Analysis</option>
            </select>
            <button className="filter-button"><Filter size={18} /> Filter</button>
          </div>
        </div>

        {loading ? (
          <PageLoader message="Loading reports…" className="min-h-0 py-12" />
        ) : reports.length === 0 ? (
          <div className="empty-state-container">
            <FolderOpen size={64} className="empty-icon" />
            <h3>No reports yet</h3>
            <p>Click "Generate New Report" to create your first report.</p>
            <button className="primary-button" onClick={() => setShowGenerateModal(true)}>
              <Plus size={18} />
              Generate Report
            </button>
          </div>
        ) : (
          <div className="reports-grid">
            {reports.map((report) => (
              <div key={report.id} className="report-card">
                <div className="report-header">
                  <div className="report-icon"><FileText size={24} /></div>
                  <div className="report-actions">
                    <button className="icon-btn" onClick={() => handleDownload(report)} title="Download">
                      <Download size={16} />
                    </button>
                    <button className="icon-btn delete" onClick={() => handleDelete(report.id)} title="Delete">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="report-content">
                  <h3 className="report-title">{report.title}</h3>
                  <div className="report-meta">
                    <span className="type">{getTypeLabel(report.type)}</span>
                    <span className="date"><Calendar size={14} /> {formatDate(report.created_at)}</span>
                  </div>
                  {report.file_size > 0 && (
                    <p className="report-size">{Math.round(report.file_size / 1024)} KB</p>
                  )}
                </div>
                <div className="report-footer">
                  <span className={`status-badge ${report.status}`}>
                    {report.status === 'published' ? 'Published' :
                     report.status === 'draft' ? 'Draft' : 'Generating...'}
                  </span>
                  <button className="action-button" onClick={() => handleDownload(report)}>
                    <Eye size={16} /> View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Report Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Generate New Report</h3>
              <button className="close-btn" onClick={() => setShowGenerateModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleGenerate}>
              <div className="form-group">
                <label>Report Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Progress Report"
                  value={newReport.title}
                  onChange={e => setNewReport({ ...newReport, title: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Report Type</label>
                <select
                  value={newReport.type}
                  onChange={e => setNewReport({ ...newReport, type: e.target.value })}
                >
                  <option value="student_performance">Student Performance</option>
                  <option value="exercise_analytics">Exercise Analytics</option>
                  <option value="quarterly_review">Quarterly Review</option>
                  <option value="content_analysis">Content Analysis</option>
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>From Date</label>
                  <input
                    type="date"
                    value={newReport.date_range.start}
                    onChange={e => setNewReport({ ...newReport, date_range: { ...newReport.date_range, start: e.target.value } })}
                  />
                </div>
                <div className="form-group">
                  <label>To Date</label>
                  <input
                    type="date"
                    value={newReport.date_range.end}
                    onChange={e => setNewReport({ ...newReport, date_range: { ...newReport.date_range, end: e.target.value } })}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowGenerateModal(false)}>Cancel</button>
                <button type="submit" className="submit-btn" disabled={generating}>
                  {generating ? <Spinner size="sm" /> : <Plus size={18} />}
                  {generating ? 'Generating...' : 'Generate Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorReportsPage;