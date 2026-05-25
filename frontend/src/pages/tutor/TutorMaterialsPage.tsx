// src/pages/tutor/TutorMaterialsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Upload, Video, BookOpen, FileText, Link as LinkIcon, X, Eye,
  Edit, Trash2, Search, FolderOpen
} from 'lucide-react';
import { getMaterials, uploadMaterial, updateMaterial, deleteMaterial, publishMaterial, unpublishMaterial } from '../../services/tutorService';
import type { TeachingMaterial } from '../../types/tutor';
import { showToast } from '../../lib/toast';
import { PageLoader, Spinner } from '../../components/ui/Loading';
import '../../assets/css/TutorMaterialsPage.css';
import '../../assets/css/RoleDashboard.css';

function normalizeTags(tags: TeachingMaterial['tags']): string {
  if (Array.isArray(tags)) return tags.join(', ');
  if (typeof tags === 'string') return tags;
  return '';
}

const TutorMaterialsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'all' | 'video' | 'ebook' | 'exercise'>('all');
  const [materials, setMaterials] = useState<TeachingMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<TeachingMaterial | null>(null);
  const [uploadType, setUploadType] = useState<'video' | 'ebook' | 'link' | 'exercise'>('video');
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');

  const [newMaterial, setNewMaterial] = useState({
    title: '',
    description: '',
    difficulty: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    tags: '',
    file: null as File | null,
    video_url: '',
    is_published: false,
  });

  const fetchMaterials = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (activeTab !== 'all') params.material_type = activeTab;
      if (searchTerm) params.search = searchTerm;
      if (filterDifficulty) params.difficulty = filterDifficulty;

      const data = await getMaterials(params);
      setMaterials(Array.isArray(data) ? data : []);
    } catch {
      showToast({ type: 'error', message: 'Failed to load materials' });
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchTerm, filterDifficulty]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Handle file selection (works for click and drag & drop)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setNewMaterial({ ...newMaterial, file: e.target.files[0] });
    }
  };

  // Open file picker when clicking on drag area
  const handleDragAreaClick = () => {
    const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
    if (fileInput) fileInput.click();
  };

  const resetForm = () => {
    setNewMaterial({ title: '', description: '', difficulty: 'beginner', tags: '', file: null, video_url: '', is_published: false });
    setEditingMaterial(null);
    setUploadType('video');
  };

  useEffect(() => {
    if (searchParams.get('upload') === 'true') {
      resetForm();
      setShowUploadModal(true);
    }
  }, [searchParams]);

  const openEditModal = (material: TeachingMaterial) => {
    setEditingMaterial(material);
    setUploadType(material.material_type as 'video' | 'ebook' | 'link' | 'exercise');
    setNewMaterial({
      title: material.title,
      description: material.description ?? '',
      difficulty: material.difficulty as 'beginner' | 'intermediate' | 'advanced',
      tags: normalizeTags(material.tags),
      file: null,
      video_url: material.video_url ?? '',
      is_published: material.is_published,
    });
    setShowUploadModal(true);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMaterial.title.trim()) {
      showToast({ type: 'error', message: 'Title is required' });
      return;
    }

    if (!editingMaterial && uploadType !== 'link' && !newMaterial.file) {
      showToast({ type: 'error', message: 'Please select a file' });
      return;
    }

    if (uploadType === 'link' && !newMaterial.video_url.trim()) {
      showToast({ type: 'error', message: 'Please enter a valid URL' });
      return;
    }

    setUploading(true);

    try {
      if (editingMaterial) {
        const updated = await updateMaterial(editingMaterial.id, {
          title: newMaterial.title,
          description: newMaterial.description,
          difficulty: newMaterial.difficulty,
          tags: newMaterial.tags.split(',').map(t => t.trim()).filter(Boolean),
          video_url: uploadType === 'link' ? newMaterial.video_url : undefined,
          is_published: newMaterial.is_published,
        });
        setMaterials(prev => prev.map(m => (m.id === updated.id ? updated : m)));
        showToast({ type: 'success', message: 'Material updated successfully!' });
      } else {
        const formData = new FormData();
        formData.append('title', newMaterial.title);
        formData.append('description', newMaterial.description || '');
        formData.append('material_type', uploadType);
        formData.append('difficulty', newMaterial.difficulty);
        formData.append('tags', JSON.stringify(
          newMaterial.tags.split(',').map(t => t.trim()).filter(Boolean)
        ));
        formData.append('is_published', String(newMaterial.is_published));
        if (uploadType === 'link') {
          formData.append('video_url', newMaterial.video_url);
        } else if (newMaterial.file) {
          formData.append('file', newMaterial.file);
        }
        await uploadMaterial(formData);
        showToast({ type: 'success', message: 'Material uploaded successfully!' });
        fetchMaterials();
      }

      setShowUploadModal(false);
      resetForm();
    } catch {
      showToast({ type: 'error', message: editingMaterial ? 'Failed to update material' : 'Failed to upload material' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this material?')) return;

    try {
      await deleteMaterial(id);
      showToast({ type: 'success', message: 'Material deleted successfully' });
      fetchMaterials();
    } catch {
      showToast({ type: 'error', message: 'Failed to delete material' });
    }
  };

  const handleTogglePublish = async (material: TeachingMaterial) => {
    try {
      const updated = material.is_published
        ? await unpublishMaterial(material.id)
        : await publishMaterial(material.id);
      setMaterials(prev => prev.map(m => (m.id === updated.id ? updated : m)));
      showToast({
        type: 'success',
        message: updated.is_published ? 'Material published' : 'Material unpublished',
      });
    } catch {
      showToast({ type: 'error', message: 'Failed to update publish status' });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video size={20} />;
      case 'ebook': return <BookOpen size={20} />;
      case 'exercise': return <FileText size={20} />;
      default: return <LinkIcon size={20} />;
    }
  };

  const getDifficultyClass = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'easy';
      case 'intermediate': return 'medium';
      case 'advanced': return 'hard';
      default: return 'easy';
    }
  };

  return (
    <div className="role-dashboard tutor-materials-page">
<div className="page-header">
        <div className="header-content">
          <h1 className="page-title">Teaching Materials</h1>
          <p className="page-subtitle">Upload and manage videos, e-books, exercises and links</p>
        </div>
        <button className="upload-button" onClick={() => { resetForm(); setShowUploadModal(true); }}>
          <Upload size={20} />
          <span>Upload New</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="materials-tabs">
        <button className={`tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
          All Materials
        </button>
        <button className={`tab ${activeTab === 'video' ? 'active' : ''}`} onClick={() => setActiveTab('video')}>
          <Video size={16} /> Videos
        </button>
        <button className={`tab ${activeTab === 'ebook' ? 'active' : ''}`} onClick={() => setActiveTab('ebook')}>
          <BookOpen size={16} /> E-Books
        </button>
        <button className={`tab ${activeTab === 'exercise' ? 'active' : ''}`} onClick={() => setActiveTab('exercise')}>
          <FileText size={16} /> Exercises
        </button>
      </div>

      {/* Search & Filter */}
      <div className="search-filter-bar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search materials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-options">
          <select
            className="difficulty-filter"
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
          >
            <option value="">All Difficulties</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader message="Loading materials…" className="min-h-0 py-12" />
      ) : materials.length === 0 ? (
        <div className="empty-state-container">
          <FolderOpen size={64} className="empty-icon" />
          <h3>No materials found</h3>
          <p>Upload your first teaching material to get started.</p>
          <button className="primary-button" onClick={() => { resetForm(); setShowUploadModal(true); }}>
            <Upload size={18} /> Upload Now
          </button>
        </div>
      ) : (
        <div className="materials-grid">
          {materials.map((material) => (
            <div key={material.id} className="material-card">
              <div className="material-header">
                <div className={`material-type ${material.material_type}`}>
                  {getTypeIcon(material.material_type)}
                </div>
                <div className="material-actions">
                  <button className="icon-btn" onClick={() => window.open(material.file_url || material.video_url, '_blank')}>
                    <Eye size={16} />
                  </button>
                  <button className="icon-btn" onClick={() => openEditModal(material)}>
                    <Edit size={16} />
                  </button>
                  <button className="icon-btn delete" onClick={() => handleDelete(material.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="material-content">
                <h3 className="material-title">{material.title}</h3>
                <div className="material-meta">
                  <span className={`difficulty-badge ${getDifficultyClass(material.difficulty)}`}>
                    {material.difficulty}
                  </span>
                  <span className="meta-item">
                    {new Date(material.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="material-description">
                  {material.description
                    ? `${material.description.slice(0, 100)}${material.description.length > 100 ? '…' : ''}`
                    : 'No description'}
                </p>
              </div>

              <div className="material-footer">
                <span className={`status ${material.is_published ? 'published' : 'draft'}`}>
                  {material.is_published ? 'Published' : 'Draft'}
                </span>
                <button
                  className={`publish-toggle-btn ${material.is_published ? 'unpublish' : 'publish'}`}
                  onClick={() => handleTogglePublish(material)}
                  title={material.is_published ? 'Unpublish' : 'Publish'}
                >
                  {material.is_published ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="upload-modal-overlay">
          <div className="upload-modal">
            <div className="modal-header">
              <h3>{editingMaterial ? 'Edit Material' : 'Upload New Material'}</h3>
              <button className="close-btn" onClick={() => { setShowUploadModal(false); resetForm(); }}>
                <X size={20} />
              </button>
            </div>

            <div className="upload-type-selector">
              {(['video', 'ebook', 'link', 'exercise'] as const).map((type) => (
                <button
                  key={type}
                  className={`type-option ${uploadType === type ? 'active' : ''}`}
                  disabled={!!editingMaterial}
                  onClick={() => {
                    setUploadType(type);
                    setNewMaterial({ ...newMaterial, file: null, video_url: '' });
                  }}
                >
                  {type === 'video' && <Video size={24} />}
                  {type === 'ebook' && <BookOpen size={24} />}
                  {type === 'link' && <LinkIcon size={24} />}
                  {type === 'exercise' && <FileText size={24} />}
                  <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </button>
              ))}
            </div>

            <form onSubmit={handleUpload} className="upload-form">
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  placeholder="Enter material title"
                  value={newMaterial.title}
                  onChange={(e) => setNewMaterial({ ...newMaterial, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Describe the material content"
                  value={newMaterial.description}
                  onChange={(e) => setNewMaterial({ ...newMaterial, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Difficulty Level</label>
                  <select
                    value={newMaterial.difficulty}
                    onChange={(e) => setNewMaterial({ ...newMaterial, difficulty: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Tags (comma separated)</label>
                  <input
                    type="text"
                    placeholder="e.g., cybersecurity, networking"
                    value={newMaterial.tags}
                    onChange={(e) => setNewMaterial({ ...newMaterial, tags: e.target.value })}
                  />
                </div>
              </div>

              {/* File Upload Area */}
              {uploadType !== 'link' && (
                <div className="form-group">
                  <label>{editingMaterial ? 'Replace File (optional)' : 'Upload File *'}</label>
                  <div 
                    className="file-upload-area"
                    onClick={handleDragAreaClick}
                    style={{ cursor: 'pointer' }}
                  >
                    <Upload size={32} />
                    <p>Drag & drop or <strong>click to upload</strong></p>
                    <small>
                      {uploadType === 'video' && 'Supported: MP4, WebM, MOV'}
                      {uploadType === 'ebook' && 'Supported: PDF, EPUB, MOBI'}
                      {uploadType === 'exercise' && 'Supported: PDF, ZIP, DOCX'}
                    </small>
                    <input
                      id="file-upload-input"
                      type="file"
                      accept={
                        uploadType === 'video' ? 'video/*' :
                        uploadType === 'ebook' ? '.pdf,.epub,.mobi' :
                        '.pdf,.zip,.rar,.doc,.docx'
                      }
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    {newMaterial.file && (
                      <p className="selected-file">Selected: {newMaterial.file.name}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Link Upload */}
              {uploadType === 'link' && (
                <div className="form-group">
                  <label>Link URL *</label>
                  <input
                    type="url"
                    placeholder="https://youtube.com/watch?v=..."
                    value={newMaterial.video_url}
                    onChange={(e) => setNewMaterial({ ...newMaterial, video_url: e.target.value })}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label>Status</label>
                <select
                  value={newMaterial.is_published ? 'published' : 'draft'}
                  onChange={(e) => setNewMaterial({ ...newMaterial, is_published: e.target.value === 'published' })}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => { setShowUploadModal(false); resetForm(); }}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={uploading}>
                  {uploading ? (
                    <>
                      <Spinner size="sm" /> {editingMaterial ? 'Saving...' : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <Upload size={18} /> {editingMaterial ? 'Save Changes' : 'Upload Material'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorMaterialsPage;