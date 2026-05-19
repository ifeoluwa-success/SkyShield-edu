import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, HelpCircle, Map, Search } from 'lucide-react';
import {
  searchContent,
  searchItemToRoute,
  type GroupedSearchResults,
  type SearchResultItem,
} from '../../services/contentService';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/LearningMaterialsPage.css';

function ResultGroup({
  title,
  icon,
  items,
  onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  items: SearchResultItem[];
  onSelect: (item: SearchResultItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="search-group">
      <h2 className="section-title search-group-title">
        {icon} {title}
      </h2>
      <ul className="search-results-list">
        {items.map((item) => (
          <li key={`${item.type}-${item.id}`}>
            <button type="button" className="search-result-item" onClick={() => onSelect(item)}>
              <strong>{item.title}</strong>
              {item.description && <p>{item.description}</p>}
              {item.author_name && <span className="search-result-meta">{item.author_name}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ContentSearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(q);
  const [results, setResults] = useState<GroupedSearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    searchContent(q.trim())
      .then(setResults)
      .catch(() => setResults({ materials: [], paths: [], glossary: [], faqs: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [q]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      navigate(`/dashboard/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const goToResult = (item: SearchResultItem) => {
    navigate(searchItemToRoute(item));
  };

  return (
    <div className="learning-materials-page search-page">
      <Link to="/dashboard/learning-materials" className="back-link">
        <ArrowLeft size={16} /> Operational library
      </Link>

      <h1 className="page-title">Search knowledge base</h1>

      <form className="materials-toolbar" onSubmit={handleSearch}>
        <div className="search-box">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search references, paths, glossary…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            minLength={2}
          />
        </div>
        <button type="submit" className="path-enroll-btn">
          Search
        </button>
      </form>

      {loading && <PageLoader message="Searching…" className="min-h-0 py-8" />}

      {!loading && q.trim().length < 2 && (
        <p className="search-hint">Enter at least 2 characters to search.</p>
      )}

      {!loading && q.trim().length >= 2 && results && results.total === 0 && (
        <div className="empty-state">
          <p>No results for &quot;{q}&quot;</p>
        </div>
      )}

      {!loading && results && results.total > 0 && (
        <>
          <p className="search-count">{results.total} results for &quot;{q}&quot;</p>
          <ResultGroup
            title="References"
            icon={<BookOpen size={18} />}
            items={results.materials}
            onSelect={goToResult}
          />
          <ResultGroup
            title="Mission paths"
            icon={<Map size={18} />}
            items={results.paths}
            onSelect={goToResult}
          />
          <ResultGroup
            title="Glossary"
            icon={<BookOpen size={18} />}
            items={results.glossary}
            onSelect={goToResult}
          />
          <ResultGroup
            title="FAQs"
            icon={<HelpCircle size={18} />}
            items={results.faqs}
            onSelect={goToResult}
          />
        </>
      )}
    </div>
  );
};

export default ContentSearchPage;
