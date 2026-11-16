import type { InputHTMLAttributes } from 'react';
import './Toggle.css';

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>;

export default function Toggle({ className = '', ...props }: ToggleProps) {
  return <input {...props} type="checkbox" role="switch" className={`jejak-toggle ${className}`} />;
}
