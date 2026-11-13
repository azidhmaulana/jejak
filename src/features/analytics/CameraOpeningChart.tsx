import { useEffect, useId, useRef } from 'react';
type Row = { day: string; views: number };
export default function CameraOpeningChart({ rows, label }: { rows: Row[]; label: string }) {
  const gradient = useId();
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth;
  }, [rows]);
  if (!rows.length) return null;
  const max = Math.max(2, ...rows.map((row) => row.views));
  const ceiling = Math.ceil(max / 2) * 2;
  const width = Math.max(240, rows.length * 30);
  return (
    <div className="camera-opening-plot">
      <div className="camera-opening-axis" aria-hidden="true">
        <span>{ceiling}</span>
        <span>{ceiling / 2}</span>
        <span>0</span>
      </div>
      <div
        ref={scroll}
        className="camera-opening-scroll"
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        <svg width={width} height="142" role="img" aria-label={label}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8ef85f" />
              <stop offset="100%" stopColor="#358f27" />
            </linearGradient>
          </defs>
          {[0, 50, 100].map((y) => (
            <line key={y} x1="0" x2={width} y1={y + 8} y2={y + 8} stroke="#36593c" />
          ))}
          <line x1="0.5" x2="0.5" y1="8" y2="108" stroke="#689371" />
          {rows.map((row, index) => {
            const slot = width / Math.max(8, rows.length);
            const bar = Math.min(19, slot - 5);
            const height = (row.views / ceiling) * 100;
            const x = index * slot + 4;
            return (
              <g key={row.day}>
                <title>
                  {row.day.replace('T', ' ')} WIB: {row.views}
                </title>
                <rect
                  x={x}
                  y={108 - height}
                  width={bar}
                  height={height}
                  fill={`url(#${gradient})`}
                />
                <text x={x + bar / 2} y="122" textAnchor="middle">
                  {row.day.slice(11, 16) || row.day.slice(5, 10)}
                </text>
                <text x={x + bar / 2} y="135" textAnchor="middle">
                  {row.day.includes('T') ? row.day.slice(5, 10) : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
