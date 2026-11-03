import { useState } from 'react';
import { UserRound, Mail, ShieldCheck, LockKeyhole, Eye, EyeOff, Check } from 'lucide-react';
import type { User } from './authStore';
import './ProfileForm.css';
type Translate = (id: string, en: string) => string;
function PasswordRow({
  name,
  label,
  placeholder,
  tx,
  isNew = false,
}: {
  name: string;
  label: string;
  placeholder: string;
  tx: Translate;
  isNew?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="profile-password-row">
      <span>{label}</span>
      <span className="profile-password-input">
        <LockKeyhole size={18} />
        <input
          aria-label={label}
          name={name}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          required
          minLength={isNew ? 12 : 1}
          maxLength={128}
          autoComplete={isNew ? 'new-password' : 'current-password'}
        />
        <button
          type="button"
          aria-label={`${visible ? tx('Sembunyikan', 'Hide') : tx('Tampilkan', 'Show')} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}
export default function ProfileForm({
  user,
  tx,
  onSubmit,
  onCancel,
}: {
  user: User;
  tx: Translate;
  onSubmit: (data: Record<string, FormDataEntryValue>, reset: () => void) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="profile-identity">
        <span className="profile-avatar">
          <UserRound size={34} />
        </span>
        <div>
          <h3>{user.name}</h3>
          <p>
            <Mail size={15} />
            {user.email}
          </p>
          {user.role !== 'superadmin' && (
            <span className="profile-role">
              <ShieldCheck size={14} />
              {user.role === 'admin' ? 'Administrator' : user.role}
            </span>
          )}
        </div>
      </div>
      <form
        className="profile-password-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          onSubmit(Object.fromEntries(new FormData(form)), () => form.reset());
        }}
      >
        <h3>
          <LockKeyhole size={21} />
          {tx('Ubah Kata Sandi', 'Change password')}
        </h3>
        <PasswordRow
          name="currentPassword"
          label={tx('Kata sandi saat ini', 'Current password')}
          placeholder={tx('Masukkan kata sandi saat ini', 'Enter your current password')}
          tx={tx}
        />
        <PasswordRow
          name="password"
          label={tx('Kata sandi baru', 'New password')}
          placeholder={tx('Minimal 12 karakter', 'At least 12 characters')}
          tx={tx}
          isNew
        />
        <div className="profile-form-actions">
          <button type="button" onClick={onCancel}>
            {tx('Batal', 'Cancel')}
          </button>
          <button type="submit">
            <Check size={17} />
            {tx('Ubah Kata Sandi', 'Change password')}
          </button>
        </div>
      </form>
    </>
  );
}
