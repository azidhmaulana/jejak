import { setLanguage } from '../../shared/i18n/runtime.js';
import CameraSourcesPanel from './CameraSourcesPanel';
import JejakLogo from '../../shared/components/JejakLogo';
import { toast } from '../../shared/components/Toast';
import { useEffect, useRef, useState } from 'react';
import {
  X,
  Home,
  Settings,
  Video,
  Menu,
  UserRound,
  Bell,
  Users,
  ShieldCheck,
  Plus,
  Search,
  Pencil,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, hasCmsAccess, useAuth, type User } from './authStore';
import { useLanguage } from '../../shared/i18n/useLanguage';
import './CmsPanel.css';
type CmsTab = 'dashboard' | 'users' | 'roles' | 'sources' | 'settings';
type Role = { id: string; permissions: string[] };
export default function CmsPanel() {
  const { user, cmsOpen, refresh } = useAuth();
  const en = useLanguage() === 'en',
    tx = (id: string, english: string) => (en ? english : id);
  const [users, setUsers] = useState<User[]>([]),
    [roles, setRoles] = useState<Role[]>([]),
    [permissions, setPermissions] = useState<string[]>([]);
  const [tab, setTab] = useState<CmsTab>('users'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0);
  const [editor, setEditor] = useState<'user' | 'role' | null>(null),
    [editing, setEditing] = useState<Role | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [actions, setActions] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const allowed = hasCmsAccess(user),
    manage = user?.permissions.includes('users.manage'),
    manageRoles = user?.permissions.includes('roles.manage');
  async function load() {
    const owner = useAuth.getState().user?.id;
    const [a, b] = await Promise.all([
      api<{ users: User[] }>('/auth/users'),
      api<{ roles: Role[]; permissions: string[] }>('/auth/roles'),
    ]);
    const current = useAuth.getState().user;
    if (
      current?.id !== owner ||
      !hasCmsAccess(current) ||
      !current?.permissions.includes('users.manage')
    )
      return;
    setUsers(a.users.filter((user) => user.role !== 'superadmin'));
    setRoles(b.roles.filter((role) => role.id !== 'superadmin'));
    setPermissions(b.permissions);
  }
  useEffect(() => {
    setUsers([]);
    setRoles([]);
    setPermissions([]);
    setEditUser(null);
    setEditing(null);
    setSelected([]);
    if (!cmsOpen || !allowed) return;
    setError('');
    setQuery('');
    setPage(0);
    setEditor(null);
    setActions(null);
    setTab('users');
    if (manage) {
      setLoading(true);
      void load()
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [cmsOpen, allowed, manage, user?.id]);
  useEffect(() => {
    if (!cmsOpen) return;
    const previous = document.activeElement as HTMLElement;
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useAuth.setState({ cmsOpen: false });
      }
      if (e.key === 'Tab') {
        const nodes = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ) || [],
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === dialog.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [cmsOpen]);
  useEffect(() => setPage(0), [query, tab]);
  if (!cmsOpen || !allowed || !user) return null;
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await task();
      toast(tx('Perubahan berhasil disimpan.', 'Changes saved successfully.'));
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const assignable = roles.filter(
    (r) =>
      r.id !== 'superadmin' &&
      (user.role === 'superadmin' || r.permissions.every((p) => user.permissions.includes(p))),
  );
  const filtered = users.filter((u) =>
    `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(query.toLowerCase()),
  );
  const current = Math.min(page, Math.max(0, Math.ceil(filtered.length / 5) - 1));
  const changeTab = (next: CmsTab) => {
    setTab(next);
    setEditor(null);
    setActions(null);
    setError('');
  };
  return (
    <div className="account-backdrop" onClick={() => useAuth.setState({ cmsOpen: false })}>
      <section
        ref={dialog}
        tabIndex={-1}
        className="account-panel cms-panel cms-console"
        data-sidebar-collapsed={collapsed}
        role="dialog"
        aria-modal="true"
        aria-label="JEJAK CMS"
        translate="no"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cms-topbar">
          <div className="cms-brand">
            <button
              aria-label={tx('Buka/tutup menu CMS', 'Toggle CMS menu')}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              <Menu size={17} />
            </button>
            <JejakLogo />
            <strong>JEJAK CMS</strong>
          </div>
          <div className="cms-top-actions">
            <button aria-label={tx('Ringkasan', 'Overview')} onClick={() => changeTab('dashboard')}>
              <Bell size={17} />
            </button>
            <button
              className="cms-account"
              onClick={() => useAuth.setState({ cmsOpen: false, open: true })}
            >
              <UserRound size={19} />
              <span>{user.name}</span>
            </button>
            <button aria-label="Close CMS" onClick={() => useAuth.setState({ cmsOpen: false })}>
              <X size={15} />
            </button>
          </div>
        </header>
        <div className="cms-layout">
          <nav className="cms-sidebar" aria-label="CMS sections">
            <button
              title="Dashboard"
              aria-label="Dashboard"
              aria-pressed={tab === 'dashboard'}
              onClick={() => changeTab('dashboard')}
            >
              <Home size={15} />
              <span>Dashboard</span>
            </button>
            <button
              title={tx('Pengguna', 'Users')}
              aria-label={tx('Pengguna', 'Users')}
              aria-pressed={tab === 'users'}
              onClick={() => changeTab('users')}
            >
              <Users size={15} />
              <span>{tx('Pengguna', 'Users')}</span>
            </button>
            <button
              title={tx('Role & izin', 'Roles & permissions')}
              aria-label={tx('Role & izin', 'Roles & permissions')}
              aria-pressed={tab === 'roles'}
              onClick={() => changeTab('roles')}
            >
              <ShieldCheck size={15} />
              <span>{tx('Role & izin', 'Roles & permissions')}</span>
            </button>
            {user.role === 'superadmin' && (
              <button
                title="CCTV Source"
                aria-label="CCTV Source"
                aria-pressed={tab === 'sources'}
                onClick={() => changeTab('sources')}
              >
                <Video size={15} />
                <span>CCTV Source</span>
              </button>
            )}
            <button
              title={tx('Pengaturan', 'Settings')}
              aria-label={tx('Pengaturan', 'Settings')}
              aria-pressed={tab === 'settings'}
              onClick={() => changeTab('settings')}
            >
              <Settings size={15} />
              <span>{tx('Pengaturan', 'Settings')}</span>
            </button>
          </nav>
          <div className="cms-content">
            <div className="cms-section-heading">
              {tab === 'sources' ? (
                <Video />
              ) : tab === 'roles' ? (
                <ShieldCheck />
              ) : tab === 'users' ? (
                <Users />
              ) : tab === 'settings' ? (
                <Settings />
              ) : (
                <Home />
              )}
              <div>
                <h2>
                  {tab === 'sources'
                    ? 'CCTV Source'
                    : tab === 'users'
                      ? tx('Pengguna', 'Users')
                      : tab === 'roles'
                        ? tx('Role & izin', 'Roles & permissions')
                        : tab === 'settings'
                          ? tx('Pengaturan', 'Settings')
                          : 'Dashboard'}
                </h2>
                <p>
                  {tab === 'sources'
                    ? tx(
                        'Daftar provider CCTV yang terhubung ke katalog.',
                        'CCTV providers connected to the catalog.',
                      )
                    : tab === 'users'
                      ? tx(
                          'Kelola pengguna sistem, atur peran, dan status akses.',
                          'Manage system users, roles, and access status.',
                        )
                      : tab === 'roles'
                        ? tx(
                            'Atur peran pengguna dan hak akses pada sistem.',
                            'Manage user roles and system permissions.',
                          )
                        : tab === 'settings'
                          ? tx(
                              'Preferensi antarmuka dan akun Anda.',
                              'Your interface and account preferences.',
                            )
                          : tx(
                              'Ringkasan pengguna dan akses sistem.',
                              'User and system access overview.',
                            )}
                </p>
              </div>
            </div>
            {error && <p role="alert">{error}</p>}
            {!manage ? (
              <p>
                {tx(
                  'Role ini belum memiliki izin pengelolaan CMS.',
                  'This role has no CMS management permission.',
                )}
              </p>
            ) : loading ? (
              <p role="status">{tx('Memuat...', 'Loading...')}</p>
            ) : tab === 'dashboard' ? (
              <div className="cms-dashboard">
                <button onClick={() => changeTab('users')}>
                  <Users />
                  <strong>{users.length}</strong>
                  <span>{tx('Pengguna', 'Users')}</span>
                </button>
                <button onClick={() => changeTab('users')}>
                  <UserRound />
                  <strong>{users.filter((u) => u.active).length}</strong>
                  <span>{tx('Akun aktif', 'Active accounts')}</span>
                </button>
                <button onClick={() => changeTab('roles')}>
                  <ShieldCheck />
                  <strong>{roles.length}</strong>
                  <span>{tx('Peran', 'Roles')}</span>
                </button>
              </div>
            ) : tab === 'sources' ? (
              <CameraSourcesPanel />
            ) : tab === 'settings' ? (
              <div className="cms-settings">
                <label>
                  {tx('Bahasa antarmuka', 'Interface language')}
                  <select
                    value={en ? 'en' : 'id'}
                    onChange={(e) => setLanguage(e.target.value === 'en' ? 'en' : 'id')}
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <button onClick={() => useAuth.setState({ cmsOpen: false, open: true })}>
                  <UserRound size={15} />
                  {tx('Buka profil & ubah kata sandi', 'Open profile & change password')}
                </button>
              </div>
            ) : (
              <>
                <div className="cms-toolbar">
                  <label className="cms-search">
                    <Search size={15} />
                    <input
                      aria-label={tx('Cari pengguna', 'Search users')}
                      placeholder={tx(
                        'Cari nama, email, atau role...',
                        'Search name, email, or role...',
                      )}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      hidden={tab !== 'users'}
                    />
                  </label>
                  {(tab === 'users' || manageRoles) && (
                    <button
                      onClick={() => {
                        setEditUser(null);
                        setEditor(tab === 'users' ? 'user' : 'role');
                        setEditing(null);
                        setSelected([]);
                      }}
                    >
                      <Plus size={15} />
                      {tab === 'users'
                        ? tx('Tambah pengguna', 'Add user')
                        : tx('Tambah role', 'Add role')}
                    </button>
                  )}
                </div>
                <fieldset disabled={busy}>
                  {editor === 'user' && (
                    <form
                      className="cms-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = Object.fromEntries(new FormData(e.currentTarget));
                        void run(async () => {
                          if (editUser)
                            await api(`/auth/users/${editUser.id}`, 'PATCH', { role: data.role });
                          else await api('/auth/users', 'POST', data);
                          await load();
                          setEditor(null);
                        });
                      }}
                    >
                      <h3>
                        {editUser
                          ? tx('Ubah pengguna', 'Edit user')
                          : tx('Pengguna baru', 'New user')}
                      </h3>
                      <div className="cms-form-grid">
                        <label>
                          {tx('Nama', 'Name')}
                          <input
                            key={editUser?.id || 'new-name'}
                            name="name"
                            required
                            maxLength={80}
                            defaultValue={editUser?.name || ''}
                            readOnly={Boolean(editUser)}
                          />
                        </label>
                        <label>
                          Email
                          <input
                            key={editUser?.id || 'new-email'}
                            name="email"
                            type="email"
                            required
                            defaultValue={editUser?.email || ''}
                            readOnly={Boolean(editUser)}
                          />
                        </label>
                        {!editUser && (
                          <label>
                            {tx('Kata sandi awal', 'Initial password')}
                            <input
                              name="password"
                              type="password"
                              minLength={12}
                              maxLength={128}
                              required
                              autoComplete="new-password"
                            />
                          </label>
                        )}
                        <label>
                          Role
                          <select
                            key={editUser?.id || 'new-role'}
                            name="role"
                            defaultValue={editUser?.role || 'viewer'}
                          >
                            {assignable.map((r) => (
                              <option key={r.id}>{r.id}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="cms-editor-actions">
                        <button type="submit">{tx('Simpan', 'Save')}</button>
                        <button type="button" onClick={() => setEditor(null)}>
                          {tx('Batal', 'Cancel')}
                        </button>
                      </div>
                    </form>
                  )}
                  {editor === 'role' && manageRoles && (
                    <form
                      className="cms-editor cms-role-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        void run(async () => {
                          await api(`/auth/roles/${data.get('role')}`, 'PUT', {
                            permissions: selected,
                          });
                          await load();
                          await refresh();
                          setEditor(null);
                        });
                      }}
                    >
                      <h3>
                        {editing ? tx('Ubah role', 'Edit role') : tx('Role baru', 'New role')}
                      </h3>
                      <label>
                        {tx('Nama role', 'Role name')}
                        <input
                          key={editing?.id || 'new'}
                          name="role"
                          defaultValue={editing?.id || ''}
                          readOnly={Boolean(editing)}
                          required
                          pattern="[a-z][a-z0-9_-]{1,30}"
                        />
                      </label>
                      <div className="cms-permissions">
                        {permissions.map((p) => (
                          <label className="permission-row" key={p}>
                            <input
                              type="checkbox"
                              checked={selected.includes(p)}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? [...selected, p]
                                    : selected.filter((v) => v !== p),
                                )
                              }
                            />
                            {p}
                          </label>
                        ))}
                      </div>
                      <div className="cms-editor-actions">
                        <button type="submit">{tx('Simpan role', 'Save role')}</button>
                        <button type="button" onClick={() => setEditor(null)}>
                          {tx('Batal', 'Cancel')}
                        </button>
                      </div>
                    </form>
                  )}
                  <div className="cms-table-scroll">
                    {tab === 'users' ? (
                      <table>
                        <thead>
                          <tr>
                            <th>No</th>
                            <th>{tx('Nama', 'Name')}</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>{tx('Tindakan', 'Actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.slice(current * 5, current * 5 + 5).map((u, index) => {
                            const locked =
                              u.id === user.id ||
                              u.role === 'superadmin' ||
                              (user.role !== 'superadmin' &&
                                u.permissions.some((p) => !user.permissions.includes(p)));
                            return (
                              <tr key={u.id}>
                                <td>{current * 5 + index + 1}</td>
                                <td>{u.name}</td>
                                <td>{u.email}</td>
                                <td>
                                  <span className="cms-role-badge" data-role={u.role}>
                                    {u.role}
                                  </span>
                                </td>
                                <td>
                                  <span className={`cms-status ${u.active ? 'active' : ''}`}>
                                    {u.active ? tx('Aktif', 'Active') : tx('Nonaktif', 'Inactive')}
                                  </span>
                                </td>
                                <td>
                                  <div className="cms-row-actions">
                                    <button
                                      className="cms-icon-action"
                                      aria-label={`${tx('Ubah', 'Edit')} ${u.email}`}
                                      disabled={locked}
                                      onClick={() => {
                                        setEditUser(u);
                                        setEditor('user');
                                        setActions(null);
                                      }}
                                    >
                                      <Pencil size={13} />
                                    </button>
                                    <button
                                      className="cms-icon-action"
                                      aria-label={`${tx('Tindakan', 'Actions')} ${u.email}`}
                                      aria-expanded={actions === u.id}
                                      disabled={locked}
                                      onClick={() => setActions(actions === u.id ? null : u.id)}
                                    >
                                      <MoreHorizontal size={14} />
                                    </button>
                                    {actions === u.id && (
                                      <div className="cms-row-menu">
                                        <button
                                          onClick={() =>
                                            void run(async () => {
                                              await api(`/auth/users/${u.id}`, 'PATCH', {
                                                active: !u.active,
                                              });
                                              await load();
                                              setActions(null);
                                            })
                                          }
                                        >
                                          {u.active
                                            ? tx('Nonaktifkan', 'Disable')
                                            : tx('Aktifkan', 'Enable')}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {!filtered.length && (
                            <tr>
                              <td colSpan={6}>
                                {tx('Tidak ada pengguna yang cocok.', 'No matching users.')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>No</th>
                            <th>Role</th>
                            <th>{tx('Izin', 'Permissions')}</th>
                            <th>{tx('Tindakan', 'Actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roles.map((r, index) => (
                            <tr key={r.id}>
                              <td>{index + 1}</td>
                              <td>{r.id}</td>
                              <td>
                                <div className="cms-permission-tags">
                                  {r.permissions.length
                                    ? r.permissions.map((p) => <span key={p}>{p}</span>)
                                    : tx('Tanpa izin', 'No permissions')}
                                </div>
                              </td>
                              <td>
                                {manageRoles && r.id !== 'superadmin' ? (
                                  <button
                                    aria-label={`${tx('Ubah', 'Edit')} ${r.id}`}
                                    onClick={() => {
                                      setEditor('role');
                                      setEditing(r);
                                      setSelected([...r.permissions]);
                                    }}
                                  >
                                    <Pencil size={13} />
                                    {tx('Ubah', 'Edit')}
                                  </button>
                                ) : (
                                  <span>{tx('Hanya baca', 'Read only')}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </fieldset>
                {tab === 'users' && (
                  <footer className="cms-pagination">
                    <span>
                      {filtered.length ? current * 5 + 1 : 0}-
                      {Math.min((current + 1) * 5, filtered.length)} {tx('dari', 'of')}{' '}
                      {filtered.length} {tx('pengguna', 'users')}
                    </span>
                    <button
                      aria-label={tx('Sebelumnya', 'Previous')}
                      disabled={current === 0}
                      onClick={() => setPage(current - 1)}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from(
                      { length: Math.min(5, Math.max(1, Math.ceil(filtered.length / 5))) },
                      (_, i) =>
                        Math.max(0, Math.min(current - 2, Math.ceil(filtered.length / 5) - 5)) + i,
                    ).map((index) => (
                      <button
                        key={index}
                        aria-label={`${tx('Halaman', 'Page')} ${index + 1}`}
                        aria-current={current === index ? 'page' : undefined}
                        onClick={() => setPage(index)}
                      >
                        {index + 1}
                      </button>
                    ))}
                    <button
                      aria-label={tx('Berikutnya', 'Next')}
                      disabled={(current + 1) * 5 >= filtered.length}
                      onClick={() => setPage(current + 1)}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </footer>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
