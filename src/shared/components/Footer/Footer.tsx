import type { ReactNode } from 'react';
import styles from './Footer.module.css';

interface FooterProps {
  children?: ReactNode;
  trailing?: ReactNode;
  boxes?: number;
}

const Footer = ({ children, trailing, boxes = 3 }: FooterProps) => (
  <footer
    className={`${styles.footer} bms-workspace-controls`}
    aria-label="Navigasi workspace dan sidebar"
  >
    {children}
    <div className={styles.footerRail} aria-hidden="true">
      <div className={styles.footerRailLine} />
      <div className={styles.footerRailBoxes}>
        {Array.from({ length: boxes }, (_, index) => (
          <div key={index} className={styles.footerRailBox} />
        ))}
      </div>
    </div>
    {trailing}
  </footer>
);

export default Footer;
