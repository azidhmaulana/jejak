import { useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, Maximize2, Minimize2, Radio, RefreshCw, X } from 'lucide-react';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useWorkspace } from '../osint/workspaceStore';
import { spaceEmbedUrl, spaceStreams } from './spaceStreams';
import './SpacePanel.css';

export default function SpacePanel() {
  const language = useLanguage();
  const english = language === 'en';
  const [selected, setSelected] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [top, setTop] = useState(8);
  const panel = useRef<HTMLElement>(null);
  const stream = spaceStreams[selected];

  useLayoutEffect(() => {
    const element = panel.current;
    const workspace = element?.closest('.osint-map-workspace');
    const trigger = document.querySelector('[data-space-trigger]');
    if (!element || !workspace || !trigger) return;
    const position = () => {
      const bounds = workspace.getBoundingClientRect();
      setTop(
        Math.max(
          8,
          Math.min(
            trigger.getBoundingClientRect().top - bounds.top,
            bounds.height - element.getBoundingClientRect().height - 12,
          ),
        ),
      );
    };
    const observer = new ResizeObserver(position);
    observer.observe(workspace);
    observer.observe(element);
    position();
    return () => observer.disconnect();
  }, []);

  const close = () => {
    useWorkspace.setState({ panel: null });
    document.querySelector<HTMLButtonElement>('[data-space-trigger]')?.focus();
  };
  return (
    <aside
      ref={panel}
      id="space-stream-panel"
      className="space-stream-panel"
      data-expanded={expanded}
      data-i18n-skip
      style={{ top }}
      aria-label={english ? 'Live from space' : 'Siaran antariksa'}
    >
      <header className="space-stream-heading">
        <Radio size={14} />
        <h2>{english ? 'LIVE FROM SPACE' : 'SIARAN ANTARIKSA'}</h2>
        <span className="space-stream-count">
          {spaceStreams.length} {english ? 'FEEDS' : 'SIARAN'}
        </span>
        <button
          aria-label={english ? 'Reload space stream' : 'Muat ulang siaran antariksa'}
          onClick={() => {
            setLoaded(false);
            setAttempt((value) => value + 1);
          }}
        >
          <RefreshCw size={13} />
        </button>
        <button
          aria-label={
            expanded
              ? english
                ? 'Collapse space panel'
                : 'Perkecil panel antariksa'
              : english
                ? 'Expand space panel'
                : 'Perbesar panel antariksa'
          }
          aria-pressed={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button
          aria-label={english ? 'Close space panel' : 'Tutup panel antariksa'}
          onClick={close}
        >
          <X size={14} />
        </button>
      </header>
      <div className="space-stream-video" aria-busy={!loaded}>
        {!loaded && (
          <span className="space-stream-loading" role="status">
            {english ? 'Loading YouTube player…' : 'Memuat pemutar YouTube…'}
          </span>
        )}
        <iframe
          key={`${stream.id}-${attempt}`}
          src={spaceEmbedUrl(stream.videoId)}
          title={`${stream.provider} — ${stream.label}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
        />
      </div>
      <div
        className="space-stream-tabs"
        role="group"
        aria-label={english ? 'Space streams' : 'Pilihan siaran antariksa'}
      >
        {spaceStreams.map((item, index) => (
          <button
            key={item.id}
            aria-pressed={selected === index}
            onClick={() => {
              if (index !== selected) {
                setLoaded(false);
                setSelected(index);
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <footer className="space-stream-footer">
        <p>
          <strong>{stream.provider}</strong> · {stream.description[language]}
        </p>
        <a
          href={`https://www.youtube.com/watch?v=${stream.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={12} /> {english ? 'Open YouTube' : 'Buka YouTube'}
        </a>
        <small>
          {english
            ? 'Dark views or signal interruptions can occur. If playback fails, open YouTube.'
            : 'Gambar dapat gelap atau sinyal terputus. Jika gagal diputar, buka YouTube.'}
        </small>
      </footer>
    </aside>
  );
}
