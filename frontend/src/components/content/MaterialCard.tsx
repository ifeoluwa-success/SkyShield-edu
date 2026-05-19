import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Video, FileText, Clock, Bookmark, ChevronRight } from 'lucide-react';
import type { ContentMaterial } from '../../services/contentService';

interface MaterialCardProps {
  material: ContentMaterial;
  onBookmark?: (slug: string) => void;
  bookmarking?: boolean;
}

function MaterialIcon({ type }: { type: string }) {
  switch (type) {
    case 'video':
      return <Video size={20} />;
    case 'document':
    case 'presentation':
      return <FileText size={20} />;
    default:
      return <BookOpen size={20} />;
  }
}

const MaterialCard: React.FC<MaterialCardProps> = ({ material, onBookmark, bookmarking }) => {
  const detailPath = `/dashboard/learning-materials/${material.slug}`;

  return (
    <div className="material-card">
      <div className="material-icon">
        <MaterialIcon type={material.material_type} />
      </div>
      <div className="material-info">
        <Link to={detailPath} className="material-title-link">
          <h3>{material.title}</h3>
        </Link>
        <p>{material.description}</p>
        <div className="material-meta">
          <span className="material-type-badge">{material.material_type}</span>
          <span className={`difficulty-pill ${material.difficulty}`}>{material.difficulty}</span>
          {material.estimated_read_time ? (
            <span className="material-time">
              <Clock size={12} /> {material.estimated_read_time} min
            </span>
          ) : null}
          {material.category_name ? (
            <span className="material-category">{material.category_name}</span>
          ) : null}
          {material.average_rating != null && material.average_rating > 0 ? (
            <span className="material-rating">★ {material.average_rating.toFixed(1)}</span>
          ) : null}
        </div>
      </div>
      <div className="material-actions">
        {onBookmark ? (
          <button
            type="button"
            className={`bookmark-btn ${material.is_bookmarked ? 'active' : ''}`}
            title={material.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
            disabled={bookmarking}
            onClick={() => onBookmark(material.slug)}
          >
            <Bookmark size={16} fill={material.is_bookmarked ? 'currentColor' : 'none'} />
          </button>
        ) : null}
        <Link to={detailPath} className="view-btn">
          Open <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
};

export default MaterialCard;
