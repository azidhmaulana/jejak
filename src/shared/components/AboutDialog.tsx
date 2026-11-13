import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../i18n/useLanguage';
import './AboutDialog.css';

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  const en = useLanguage() === 'en';
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="jejak-about" aria-labelledby="jejak-about-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header><img src="/jejak-logo.svg" alt="" width="30" height="30" /><h2 id="jejak-about-title">{en ? 'About JEJAK' : 'Tentang JEJAK'}</h2><button aria-label={en ? 'Close About' : 'Tutup Tentang'} onClick={onClose}><X size={14} /></button></header>
    <div className="jejak-about-body"><strong>JEJAK · v1.0.0</strong><p>Geospatial Intelligence Platform</p>
      <p>{en ? 'Explore public CCTV, cameras along routes, earthquake data, and map objects in one workspace.' : 'Jelajahi CCTV publik, kamera sepanjang rute, data gempa, dan objek peta dalam satu workspace.'}</p>
      <p>{en ? 'Camera streams and earthquake data come from their respective providers. Availability and coverage depend on the source.' : 'Stream kamera dan data gempa berasal dari masing-masing penyedia. Ketersediaan dan cakupan mengikuti sumber data.'}</p>
      <a href="/tentang.html" target="_blank" rel="noreferrer">{en ? 'Read more about JEJAK' : 'Selengkapnya tentang JEJAK'} ↗</a>
    </div>
  </dialog>, document.body);
}
