import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLanguage } from '../../shared/i18n/useLanguage';

export type RegionEventRow = {
  id: string;
  title: string;
  time?: number;
  detail: string;
  color: string;
  rank?: number;
};
export default function RegionEventList({
  title,
  rows,
  loading,
  onClose,
  selectedId,
  onSelect,
  sortLabel,
}: {
  title: string;
  sortLabel?: string;
  rows: RegionEventRow[];
  loading: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const en = useLanguage() === 'en';
  const [page, setPage] = useState(0);
  const [order, setOrder] = useState('latest');
  const sortedRows =
    order === 'latest'
      ? rows
      : [...rows].sort((a, b) => {
          if (a.rank == null) return b.rank == null ? 0 : 1;
          if (b.rank == null) return -1;
          return (
            (order === 'high' ? b.rank - a.rank : a.rank - b.rank) || (b.time || 0) - (a.time || 0)
          );
        });
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const current = Math.min(page, pages - 1);
  const start = current * 10;
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [current, order]);
  return (
    <section className="province-event-list" aria-label={title}>
      <header>
        <h3>
          {title} ({rows.length})
        </h3>
        {sortLabel && (
          <select
            className="province-event-sort"
            aria-label={sortLabel}
            title={sortLabel}
            value={order}
            onChange={(event) => {
              setOrder(event.target.value);
              setPage(0);
            }}
          >
            <option value="latest">{en ? 'Latest' : 'Terbaru'}</option>
            <option value="high">{en ? 'High to low' : 'Tertinggi dahulu'}</option>
            <option value="low">{en ? 'Low to high' : 'Terendah dahulu'}</option>
          </select>
        )}
        <button
          type="button"
          aria-label={en ? 'Close event list' : 'Tutup daftar kejadian'}
          onClick={onClose}
        >
          <X size={12} />
        </button>
      </header>
      <div className="province-event-rows" ref={list}>
        {sortedRows.slice(start, start + 10).map((row) => (
          <button
            type="button"
            className="province-event-row"
            key={row.id}
            aria-pressed={selectedId === row.id}
            onClick={() => onSelect(row.id)}
            title={row.title}
          >
            <i aria-hidden="true" style={{ backgroundColor: row.color }} />
            <span>
              <strong>{row.title}</strong>
              <small>
                {row.detail}
                {row.time !== undefined && (
                  <>
                    {' '}
                    -{' '}
                    <time dateTime={new Date(row.time).toISOString()}>
                      {new Date(row.time).toLocaleString(en ? 'en-GB' : 'id-ID')}
                    </time>
                  </>
                )}
              </small>
            </span>
          </button>
        ))}
        {!rows.length && (
          <p role="status">
            {loading
              ? en
                ? 'Loading data...'
                : 'Memuat data...'
              : en
                ? 'No data in this province for the loaded period.'
                : 'Tidak ada data di provinsi ini untuk periode yang dimuat.'}
          </p>
        )}
      </div>
      <footer>
        <span>
          {rows.length ? start + 1 : 0}-{Math.min(start + 10, rows.length)} / {rows.length}
        </span>
        <button
          type="button"
          disabled={current === 0}
          aria-label={en ? 'Previous events' : 'Kejadian sebelumnya'}
          onClick={() => setPage(current - 1)}
        >
          <ChevronLeft size={12} />
        </button>
        <button
          type="button"
          disabled={current === pages - 1}
          aria-label={en ? 'Next events' : 'Kejadian berikutnya'}
          onClick={() => setPage(current + 1)}
        >
          <ChevronRight size={12} />
        </button>
      </footer>
    </section>
  );
}
