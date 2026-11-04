import './JejakLogo.css';
export default function JejakLogo({ full = false }: { full?: boolean }) {
  const icon = (
    <img className="jejak-logo-icon" src="/jejak-logo.svg" alt="" width="40" height="40" />
  );
  if (full)
    return (
      <span
        className="jejak-brand-art"
        aria-label="JEJAK — Geospatial Intelligence Platform"
        role="img"
      >
        {icon}
        <span className="jejak-brand-type">
          <strong>JEJAK</strong>
          <small>Geospatial Intelligence Platform</small>
        </span>
      </span>
    );
  return icon;
}
