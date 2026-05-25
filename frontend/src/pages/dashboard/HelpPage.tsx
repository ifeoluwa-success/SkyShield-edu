import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, HelpCircle, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { getGlossaryTerms, getFAQs, type GlossaryTerm, type FAQ } from '../../services/contentService';
import { showToast } from '../../lib/toast';
import { Spinner } from '../../components/ui/Loading';
import '../../assets/css/HelpPage.css';

const HelpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'glossary' | 'faq'>('glossary');
  const [search, setSearch] = useState('');
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [glossaryRes, faqRes] = await Promise.allSettled([
        getGlossaryTerms(),
        getFAQs(),
      ]);
      if (glossaryRes.status === 'fulfilled') setGlossary(glossaryRes.value);
      else showToast({ type: 'error', message: 'Failed to load glossary' });
      if (faqRes.status === 'fulfilled') setFaqs(faqRes.value);
      else showToast({ type: 'error', message: 'Failed to load FAQs' });
      setLoading(false);
    };
    fetchAll();
  }, []);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const filteredGlossary = glossary.filter(
    g =>
      g.term.toLowerCase().includes(search.toLowerCase()) ||
      g.definition.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredFaqs = faqs.filter(
    f =>
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase()),
  );

  // Group glossary terms alphabetically
  const grouped = filteredGlossary.reduce<Record<string, GlossaryTerm[]>>((acc, term) => {
    const letter = term.term[0].toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(term);
    return acc;
  }, {});
  const letters = Object.keys(grouped).sort();

  return (
    <div className="help-page">
<div className="help-header">
        <div>
          <h1 className="help-title">Help Center</h1>
          <p className="help-subtitle">Cybersecurity glossary and frequently asked questions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="help-tabs">
        <button
          className={`help-tab ${activeTab === 'glossary' ? 'active' : ''}`}
          onClick={() => { setActiveTab('glossary'); setSearch(''); }}
        >
          <BookOpen size={16} /> Glossary
        </button>
        <button
          className={`help-tab ${activeTab === 'faq' ? 'active' : ''}`}
          onClick={() => { setActiveTab('faq'); setSearch(''); }}
        >
          <HelpCircle size={16} /> FAQ
        </button>
      </div>

      {/* Search */}
      <div className="help-search-bar">
        <Search size={18} />
        <input
          type="text"
          value={search}
          onChange={handleSearch}
          placeholder={activeTab === 'glossary' ? 'Search terms…' : 'Search questions…'}
        />
      </div>

      {loading ? (
        <div className="help-loading">
          <Spinner size="md" /> Loading…
        </div>
      ) : activeTab === 'glossary' ? (
        filteredGlossary.length === 0 ? (
          <div className="help-empty">
            <BookOpen size={40} opacity={0.25} />
            <p>{search ? 'No matching terms' : 'No glossary terms available yet'}</p>
          </div>
        ) : (
          <div className="glossary-content">
            {letters.map(letter => (
              <div key={letter} className="glossary-group">
                <div className="glossary-letter">{letter}</div>
                <div className="glossary-terms">
                  {grouped[letter].map(term => (
                    <div key={term.id} className="glossary-term">
                      <div className="term-header">
                        <span className="term-name">{term.term}</span>
                        {term.category && (
                          <span className="term-category">{term.category}</span>
                        )}
                      </div>
                      <p className="term-definition">{term.definition}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        filteredFaqs.length === 0 ? (
          <div className="help-empty">
            <HelpCircle size={40} opacity={0.25} />
            <p>{search ? 'No matching questions' : 'No FAQs available yet'}</p>
          </div>
        ) : (
          <div className="faq-list">
            {filteredFaqs.map(faq => (
              <div
                key={faq.id}
                className={`faq-item ${openFaq === faq.id ? 'open' : ''}`}
              >
                <button
                  className="faq-question"
                  onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}
                >
                  <span>{faq.question}</span>
                  {openFaq === faq.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {openFaq === faq.id && (
                  <div className="faq-answer">{faq.answer}</div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default HelpPage;
