import { toast } from '../../shared/components/Toast';
import { useState } from 'react';
import { UserRound, UserPlus, Mail, LockKeyhole, Eye, EyeOff } from 'lucide-react';
import './AuthForm.css';
type Translate = (id: string, en: string) => string;
function PasswordField({
  name,
  label,
  placeholder,
  tx,
  create = false,
}: {
  name: string;
  label: string;
  placeholder: string;
  tx: Translate;
  create?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {label}
      <span className="auth-input">
        <LockKeyhole size={19} />
        <input
          aria-label={label}
          name={name}
          type={visible ? 'text' : 'password'}
          required
          minLength={create ? 12 : 1}
          maxLength={128}
          placeholder={placeholder}
          autoComplete={create ? 'new-password' : 'current-password'}
        />
        <button
          className="auth-eye"
          type="button"
          aria-label={`${visible ? tx('Sembunyikan', 'Hide') : tx('Tampilkan', 'Show')} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
    </label>
  );
}
export default function AuthForm({
  setupRequired,
  register,
  setRegister,
  busy,
  tx,
  onSubmit,
}: {
  setupRequired: boolean;
  register: boolean;
  setRegister: (value: boolean) => void;
  busy: boolean;
  tx: Translate;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [help, setHelp] = useState<'password' | 'privacy' | null>(null);
  return (
    <>
      {!setupRequired && (
        <div className="auth-tabs" role="tablist" aria-label={tx('Akses akun', 'Account access')}>
          <button
            type="button"
            role="tab"
            aria-selected={!register}
            onClick={() => {
              setRegister(false);
              setHelp(null);
            }}
          >
            <UserRound size={21} />
            {tx('Masuk', 'Login')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={register}
            onClick={() => {
              setRegister(true);
              setHelp(null);
            }}
          >
            <UserPlus size={21} />
            {tx('Daftar', 'Register')}
          </button>
        </div>
      )}
      <form
        key={setupRequired ? 'setup' : register ? 'register' : 'login'}
        className="auth-form"
        onInvalid={(event) => {
          const input = event.target as HTMLInputElement;
          const message = input.validity.typeMismatch
            ? tx('Format email tidak valid.', 'Enter a valid email address.')
            : input.validity.tooShort
              ? tx(
                  'Kata sandi minimal 12 karakter.',
                  'Password must contain at least 12 characters.',
                )
              : input.type === 'checkbox'
                ? tx(
                    'Setujui Ketentuan & Privasi untuk melanjutkan.',
                    'Accept Terms & Privacy to continue.',
                  )
                : tx('Lengkapi kolom yang wajib diisi.', 'Complete the required fields.');
          toast(message, 'error');
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          onSubmit({ ...values, remember: values.remember === 'on' });
        }}
      >
        <p className="auth-intro">
          {setupRequired
            ? tx('Buat akun pengelola pertama', 'Create the first administrator')
            : register
              ? tx('Buat akun Viewer Anda', 'Create your viewer account')
              : tx('Masuk untuk melanjutkan', 'Sign in to continue')}
        </p>
        {setupRequired && (
          <label>
            Setup token
            <input name="token" required autoComplete="off" />
            <small>
              {tx(
                'Gunakan token dari .runtime/setup-token.txt pada server.',
                'Use the token from .runtime/setup-token.txt on the server.',
              )}
            </small>
          </label>
        )}
        {(register || setupRequired) && (
          <label>
            {tx('Nama lengkap', 'Full name')}
            <span className="auth-input">
              <UserRound size={19} />
              <input
                aria-label={tx('Nama lengkap', 'Full name')}
                name="name"
                required
                maxLength={80}
                placeholder={tx('Masukkan nama lengkap', 'Enter your full name')}
                autoComplete="name"
              />
            </span>
          </label>
        )}
        <label>
          Email
          <span className="auth-input">
            <Mail size={19} />
            <input
              aria-label="Email"
              name="email"
              type="email"
              required
              placeholder={tx('Masukkan email', 'Enter your email')}
              autoComplete="username"
            />
          </span>
        </label>
        <PasswordField
          name="password"
          label={tx('Kata sandi', 'Password')}
          placeholder={
            register
              ? tx(
                  'Buat kata sandi (minimal 12 karakter)',
                  'Create a password (at least 12 characters)',
                )
              : tx('Masukkan kata sandi', 'Enter your password')
          }
          tx={tx}
          create={register || setupRequired}
        />
        {register && !setupRequired && (
          <PasswordField
            name="confirmPassword"
            label={tx('Konfirmasi kata sandi', 'Confirm password')}
            placeholder={tx('Masukkan ulang kata sandi', 'Re-enter your password')}
            tx={tx}
            create
          />
        )}
        {!setupRequired &&
          (register ? (
            <div className="auth-options">
              <label className="auth-check">
                <input name="terms" type="checkbox" required />
                {tx('Saya menyetujui', 'I agree to the')}{' '}
                <button
                  className="auth-link"
                  type="button"
                  onClick={() => setHelp(help === 'privacy' ? null : 'privacy')}
                >
                  {tx('Ketentuan & Privasi', 'Terms & Privacy')}
                </button>
              </label>
            </div>
          ) : (
            <div className="auth-options">
              <label className="auth-check">
                <input name="remember" type="checkbox" />
                {tx('Ingat saya', 'Remember me')}
              </label>
              <button
                className="auth-link"
                type="button"
                onClick={() => setHelp(help === 'password' ? null : 'password')}
              >
                {tx('Lupa kata sandi?', 'Forgot password?')}
              </button>
            </div>
          ))}
        {help && (
          <aside className="auth-help" role="status">
            {help === 'password'
              ? tx(
                  'Hubungi administrator untuk meminta reset kata sandi. Pemulihan melalui email belum tersedia.',
                  'Contact your administrator to request a password reset. Email recovery is not available yet.',
                )
              : tx(
                  'Akun digunakan untuk fitur JEJAK sesuai role yang diberikan. Server menyimpan nama, email, hash kata sandi, favorit, riwayat kamera, dan rute tersimpan. Perubahan akun dan login dicatat. Perhitungan rute mengirim titik awal dan tujuan ke penyedia routing. Hubungi pengelola untuk permintaan terkait akun atau data.',
                  'Your account provides JEJAK features according to your assigned role. The server stores your name, email, password hash, favorites, camera history, and saved routes. Account changes and sign-ins are logged. Route calculations send start and destination points to the routing provider. Contact the administrator for account or data requests.',
                )}
          </aside>
        )}
        <button className="auth-submit" type="submit">
          {busy
            ? tx('Memproses...', 'Working...')
            : register || setupRequired
              ? tx('Buat akun', 'Create account')
              : tx('Masuk', 'Sign in')}
        </button>
        {!setupRequired && (
          <div className="auth-switch">
            {register
              ? tx('Sudah punya akun?', 'Already have an account?')
              : tx('Belum punya akun?', 'New here?')}{' '}
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                setRegister(!register);
                setHelp(null);
              }}
            >
              {register ? tx('Masuk', 'Sign in') : tx('Buat akun', 'Create account')}
            </button>
          </div>
        )}
      </form>
    </>
  );
}
