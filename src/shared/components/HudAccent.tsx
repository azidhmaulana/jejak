import { hudContents } from './hudMarkup.mjs';
export default function HudAccent({ markers = false }: { markers?: boolean }) {
  return (
    <span
      className="fr26-hud-accent"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: hudContents(markers) }}
    />
  );
}
