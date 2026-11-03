import { Globe, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../../shared/i18n/useLanguage';
import { setLanguage } from '../../../shared/i18n/runtime.js';

function Flag({ language }: { language: 'id' | 'en' }) {
  return (
    <svg viewBox="0 0 30 20" width="24" height="16" aria-hidden="true">
      {language === 'id' ? (
        <>
          <path fill="#fff" d="M0 0h30v20H0z" />
          <path fill="#ef3340" d="M0 0h30v10H0z" />
        </>
      ) : (
        <>
          <path fill="#14336c" d="M0 0h30v20H0z" />
          <path stroke="#fff" strokeWidth="5" d="m0 0 30 20M30 0 0 20" />
          <path stroke="#d92836" strokeWidth="2" d="m0 0 30 20M30 0 0 20" />
          <path stroke="#fff" strokeWidth="7" d="M15 0v20M0 10h30" />
          <path stroke="#d92836" strokeWidth="4" d="M15 0v20M0 10h30" />
        </>
      )}
    </svg>
  );
}
export default function LanguageToggle() {
  const language = useLanguage();
  return (
    <div className="language-dropdown" translate="no">
      <Globe className="language-globe" size={17} aria-hidden="true" />
      <span className="language-current">
        <Flag language={language} />
        <span>{language.toUpperCase()}</span>
      </span>
      <ChevronDown className="language-chevron" size={12} aria-hidden="true" />
      <select
        aria-label="Interface language"
        value={language}
        onChange={(event) => setLanguage(event.target.value === 'en' ? 'en' : 'id')}
      >
        <option value="id">Bahasa Indonesia</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}
