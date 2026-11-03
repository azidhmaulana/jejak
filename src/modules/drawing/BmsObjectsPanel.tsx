import { useAuth } from '../../features/auth/authStore';
import { mapWorkspaceLabel, isOsintMap, mapStorageKey } from '../maps/mapWorkspace';
import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  Crosshair,
  Folder,
  FolderPlus,
  Layers,
  MapPin,
  Pencil,
  Slash,
  Hexagon,
  Square,
  Circle,
  Trash2,
  X,
  Lock,
  Unlock,
  Undo2,
  Redo2,
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';
import { useCardCollapse } from '../../shared/hooks/useCardCollapse';
import HudAccent from '../../shared/components/HudAccent';
import { useMapTools, type Drawing, type DrawingFolder } from './mapToolsStore';
import {
  drawingNames,
  objectFolder,
  objectName,
  objectVisible,
  objectLocked,
  objectZone,
} from './drawingObjects';
import { drawingCursorMeasurement, measureDrawing } from './mapMeasurements';
import DrawingStyleFields from './DrawingStyleFields';
import ObjectGeometryFields from '../maps/ObjectGeometryFields';
import './BmsObjectsPanel.css';

function ObjectRow({ feature }: { feature: Drawing }) {
  const { controller, selectedId, folders } = useMapTools();
  const name = objectName(feature),
    id = feature.id!;
  const locked = objectLocked(feature);
  const zone = objectZone(feature);
  const visible = feature.properties.bmsVisible !== false;
  const groupHidden =
    folders.find((folder) => folder.id === objectFolder(feature))?.visible === false;
  const measurement = drawingCursorMeasurement(feature);
  const Icon =
    { point: MapPin, linestring: Slash, polygon: Hexagon, rectangle: Square, circle: Circle }[
      String(feature.properties.mode)
    ] || MapPin;
  return (
    <div
      className="bms-object-row"
      data-object-id={id}
      data-selected={id === selectedId}
      data-visible={objectVisible(feature, folders)}
      onContextMenu={(event) => {
        event.preventDefault();
        useMapTools.setState({ contextMenu: { id, x: event.clientX, y: event.clientY } });
      }}
    >
      <button
        type="button"
        className="bms-visibility-toggle"
        aria-label={`Visibilitas objek ${name}`}
        aria-pressed={visible}
        data-parent-hidden={groupHidden}
        title={`${visible ? 'Sembunyikan' : 'Tampilkan'} objek${groupHidden ? '; group sedang tersembunyi' : ''}`}
        onClick={() => controller?.updateDrawing(id, { visible: !visible })}
      >
        {visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <div className="bms-object-caption">
        <button
          type="button"
          className="bms-object-name"
          aria-label={`Pilih ${name}`}
          aria-pressed={id === selectedId}
          title={`${name} · klik untuk edit, klik dua kali untuk fokus`}
          onClick={() => controller?.select(id)}
          onDoubleClick={() => controller?.focusDrawing(id)}
        >
          <Icon size={13} style={{ color: String(feature.properties.drawColor || '#00c8f4') }} />
          <span translate="no">{name}</span>
        </button>
        {measurement && (
          <output
            className="bms-object-distance"
            title={
              feature.properties.mode === 'rectangle'
                ? 'Panjang × lebar'
                : measureDrawing(feature)?.label
            }
          >
            {measurement}
          </output>
        )}
      </div>
      <div className="bms-object-row-actions">
        <button
          type="button"
          aria-label={`${locked ? 'Buka kunci' : 'Kunci'} ${name}`}
          title={locked ? 'Buka kunci objek' : 'Lindungi objek dari edit dan hapus'}
          aria-pressed={locked}
          onClick={() => controller?.setLocked(id, !locked)}
        >
          {locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <button
          type="button"
          aria-label={`Fokus ${name}`}
          title="Tampilkan dan fokus ke objek"
          onClick={() => controller?.focusDrawing(id)}
        >
          <Crosshair size={12} />
        </button>
        <button
          type="button"
          aria-label={`Duplikat ${name}`}
          title="Duplikat objek"
          onClick={() => controller?.duplicate(id)}
        >
          <Copy size={12} />
        </button>
        {!isOsintMap && (
          <button
            type="button"
            className="bms-zone-toggle"
            aria-label={`Guard Zone ${name}`}
            aria-pressed={zone === 'guard'}
            disabled={locked || zone === 'white'}
            title={
              locked
                ? 'Buka kunci sebelum mengubah zona'
                : zone === 'white'
                  ? 'Nonaktifkan White Zone terlebih dahulu'
                  : `${zone === 'guard' ? 'Nonaktifkan' : 'Aktifkan'} Guard Zone`
            }
            onClick={() =>
              controller?.updateDrawing(id, { zone: zone === 'guard' ? 'none' : 'guard' })
            }
          >
            <ShieldAlert size={12} />
          </button>
        )}
        {!isOsintMap && (
          <button
            type="button"
            className="bms-zone-toggle"
            aria-label={`White Zone ${name}`}
            aria-pressed={zone === 'white'}
            disabled={locked || zone === 'guard'}
            title={
              locked
                ? 'Buka kunci sebelum mengubah zona'
                : zone === 'guard'
                  ? 'Nonaktifkan Guard Zone terlebih dahulu'
                  : `${zone === 'white' ? 'Nonaktifkan' : 'Aktifkan'} White Zone`
            }
            onClick={() =>
              controller?.updateDrawing(id, { zone: zone === 'white' ? 'none' : 'white' })
            }
          >
            <ShieldCheck size={12} />
          </button>
        )}
        <button
          type="button"
          aria-label={`Hapus ${name}`}
          title={locked ? 'Buka kunci sebelum menghapus' : 'Hapus objek'}
          disabled={locked}
          onClick={() => controller?.remove(id)}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function FolderGroup({ folder, features }: { folder: DrawingFolder; features: Drawing[] }) {
  const { controller, activeFolderId } = useMapTools();
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(folder.name),
    [confirm, setConfirm] = useState(false);
  useEffect(() => setName(folder.name), [folder.name]);
  const hasLockedObjects = features.some(objectLocked);
  return (
    <section className="bms-folder" data-folder-id={folder.id}>
      <div
        className="bms-folder-heading"
        data-active={activeFolderId === folder.id}
        data-visible={folder.visible}
      >
        <button
          type="button"
          aria-label={`${folder.collapsed ? 'Buka' : 'Lipat'} group ${folder.name}`}
          aria-expanded={!folder.collapsed}
          aria-controls={`bms-group-${folder.id}`}
          title={folder.collapsed ? 'Buka isi group' : 'Lipat isi group'}
          onClick={() => controller?.updateFolder(folder.id, { collapsed: !folder.collapsed })}
        >
          {folder.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        <button
          type="button"
          className="bms-folder-name"
          aria-pressed={activeFolderId === folder.id}
          title="Jadikan group tujuan gambar baru; klik dua kali untuk ubah nama"
          onClick={() => useMapTools.setState({ activeFolderId: folder.id })}
          onDoubleClick={() => setEditing(true)}
        >
          <Folder size={13} />
          <span translate="no">{folder.name}</span>
          <small>{features.length}</small>
        </button>
        <button
          type="button"
          className="bms-visibility-toggle"
          aria-label={`Visibilitas group ${folder.name}`}
          aria-pressed={folder.visible}
          title={`${folder.visible ? 'Sembunyikan' : 'Tampilkan'} seluruh isi group`}
          onClick={() => controller?.updateFolder(folder.id, { visible: !folder.visible })}
        >
          {folder.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          type="button"
          aria-label={`Rename group ${folder.name}`}
          title="Ubah nama group"
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          aria-label={`Hapus group ${folder.name}`}
          disabled={hasLockedObjects}
          title={
            hasLockedObjects ? 'Buka kunci objek di dalam group sebelum menghapus' : 'Hapus group'
          }
          onClick={() => setConfirm(!confirm)}
        >
          <Trash2 size={12} />
        </button>
      </div>
      {editing && (
        <form
          className="bms-folder-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) {
              controller?.updateFolder(folder.id, { name });
              setEditing(false);
            }
          }}
        >
          <input
            autoFocus
            aria-label="Nama group"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="submit"
            aria-label="Simpan nama group"
            title="Simpan nama group"
            disabled={!name.trim()}
          >
            <Save size={13} />
          </button>
          <button type="button" aria-label="Batal rename group" onClick={() => setEditing(false)}>
            <X size={12} />
          </button>
        </form>
      )}
      {confirm && (
        <div className="bms-folder-confirm">
          <p>Hapus group ini? Objek di dalamnya dipindahkan ke Objek utama.</p>
          <button
            type="button"
            disabled={hasLockedObjects}
            onClick={() => controller?.removeFolder(folder.id)}
          >
            Hapus group
          </button>
          <button type="button" onClick={() => setConfirm(false)}>
            Batal
          </button>
        </div>
      )}
      <div
        id={`bms-group-${folder.id}`}
        className="bms-folder-content"
        data-collapsed={folder.collapsed}
        aria-hidden={folder.collapsed}
        ref={(element) => {
          if (element) element.inert = folder.collapsed;
        }}
      >
        <div className="bms-folder-children">
          {features.map((feature) => (
            <ObjectRow key={feature.id} feature={feature} />
          ))}
          {!features.length && (
            <p className="bms-object-hint">Group kosong. Pilih group ini, lalu gambar di peta.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ObjectDetails({ feature }: { feature: Drawing }) {
  const { controller, folders } = useMapTools();
  const [name, setName] = useState(objectName(feature));
  useEffect(() => setName(objectName(feature)), [feature.properties.bmsName]);
  const measurement = measureDrawing(feature);
  const saveName = () => {
    if (name.trim()) controller?.updateDrawing(feature.id!, { name });
    else setName(objectName(feature));
  };
  return (
    <fieldset className="bms-object-details" disabled={objectLocked(feature)}>
      {objectLocked(feature) && (
        <p className="bms-object-hint">
          Objek dikunci. Buka kunci pada baris objek untuk mengedit.
        </p>
      )}
      <label>
        NAMA
        <input
          aria-label="Nama objek"
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              saveName();
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      <label>
        CATATAN
        <textarea
          aria-label="Catatan objek"
          maxLength={2000}
          rows={2}
          value={String(feature.properties.bmsNotes || '')}
          onChange={(event) =>
            controller?.updateDrawing(feature.id!, { notes: event.target.value })
          }
        />
      </label>
      {folders.length > 0 && (
        <label>
          GROUP
          <select
            aria-label="Group objek"
            value={objectFolder(feature)}
            onChange={(event) =>
              controller?.updateDrawing(feature.id!, { folderId: event.target.value })
            }
          >
            <option value="">Objek utama</option>
            {folders.map((folder) => (
              <option translate="no" key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="bms-object-summary">
        <span>{drawingNames[String(feature.properties.mode)]}</span>
        {measurement && <output>{drawingCursorMeasurement(feature)}</output>}
      </div>
      <ObjectGeometryFields feature={feature} />
      <DrawingStyleFields />
      {!objectVisible(feature, folders) && (
        <p className="bms-object-hint">
          Objek tersembunyi. Tombol fokus akan menampilkannya beserta groupnya.
        </p>
      )}
    </fieldset>
  );
}

function EditableObjectsPanel() {
  const state = useMapTools();
  const { collapsed, toggle, cardRef } = useCardCollapse('bms-objects', { persist: false });
  const [addingFolder, setAddingFolder] = useState(false),
    [folderName, setFolderName] = useState('');
  const [rootCollapsed, setRootCollapsed] = useState(() => {
    try {
      return localStorage.getItem(mapStorageKey('bms-root-collapsed')) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(mapStorageKey('bms-root-collapsed'), String(rootCollapsed));
    } catch {
      /* Local preference only. */
    }
  }, [rootCollapsed]);
  const selected = state.features.find((feature) => feature.id === state.selectedId);
  const root = state.features.filter((feature) => !objectFolder(feature));
  const expandedFolders = state.folders
    .map((folder) => `${folder.id}:${folder.collapsed}`)
    .join('|');
  const rootVisible =
    root.length > 0 && root.every((feature) => feature.properties.bmsVisible !== false);
  useEffect(() => {
    if (
      state.selectedId !== null &&
      state.features.some((feature) => feature.id === state.selectedId && !objectFolder(feature))
    )
      setRootCollapsed(false);
  }, [state.selectedId]);
  useEffect(() => {
    if (state.selectedId === null) return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector('.bms-object-row[data-selected=true]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [state.selectedId, expandedFolders]);
  return (
    <section
      ref={cardRef}
      className={`bms-objects-panel corner-frame${collapsed ? ' is-collapsed' : ''}`}
      aria-label="BMS objects and groups"
    >
      <header>
        <Layers size={14} />
        <strong>{mapWorkspaceLabel} OBJECTS</strong>
        <HudAccent markers={false} />
        <span
          className="bms-object-count"
          data-sync={state.syncStatus}
          title={state.syncMessage}
          aria-label={`${state.features.length} objek. ${state.syncMessage}`}
        >
          {state.features.length}
        </span>
        <button
          type="button"
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} BMS Objects`}
          aria-expanded={!collapsed}
          aria-controls="bms-objects-body"
          title={collapsed ? 'Tampilkan BMS Objects' : 'Lipat BMS Objects'}
          onClick={toggle}
        >
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </header>
      <div id="bms-objects-body" className="bms-objects-scroll" hidden={collapsed}>
        {isOsintMap ? (
          <p className="bms-object-hint" role="status">
            {state.syncMessage}
          </p>
        ) : (
          <p className="bms-object-hint" role="status">
            {
              state.features.filter(
                (feature) => feature.geometry.type === 'Polygon' && objectZone(feature) === 'guard',
              ).length
            }{' '}
            Guard Zone{' '}
            {state.syncStatus === 'synced'
              ? 'aktif · tersimpan di server'
              : 'dipilih · menunggu sinkronisasi'}
          </p>
        )}
        <div className="bms-object-actions">
          <div className="bms-history-controls" role="group" aria-label="Riwayat perubahan BMS">
            <button
              type="button"
              aria-label="Undo BMS"
              title="Undo — Ctrl+Z"
              disabled={!state.canUndo || !!state.preview}
              onClick={() => state.controller?.undo()}
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              aria-label="Redo BMS"
              title="Redo — Ctrl+Shift+Z / Ctrl+Y"
              disabled={!state.canRedo || !!state.preview}
              onClick={() => state.controller?.redo()}
            >
              <Redo2 size={14} />
            </button>
          </div>
          <div className="bms-group-controls">
            <button
              type="button"
              aria-label="Tambah group BMS"
              title="Tambah group"
              aria-expanded={addingFolder}
              onClick={() => {
                setAddingFolder(!addingFolder);
                setFolderName('');
              }}
            >
              <FolderPlus size={14} />
            </button>
          </div>
        </div>
        {addingFolder && (
          <form
            className="bms-folder-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (folderName.trim()) {
                state.controller?.addFolder(folderName);
                setAddingFolder(false);
              }
            }}
          >
            <input
              autoFocus
              aria-label="Nama group baru"
              placeholder="Nama group"
              required
              maxLength={80}
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
            />
            <button
              type="submit"
              aria-label="Simpan group baru"
              title="Simpan group baru"
              disabled={!folderName.trim()}
            >
              <Save size={13} />
            </button>
          </form>
        )}
        {state.folders.length > 0 && (
          <label className="bms-drawing-destination">
            GAMBAR BARU KE
            <select
              aria-label="Group tujuan gambar"
              value={state.activeFolderId}
              onChange={(event) => useMapTools.setState({ activeFolderId: event.target.value })}
            >
              <option value="">Objek utama</option>
              {state.folders.map((folder) => (
                <option translate="no" key={folder.id} value={folder.id}>
                  {folder.name}
                  {folder.visible ? '' : ' (tersembunyi)'}
                </option>
              ))}
            </select>
          </label>
        )}
        {state.folders.some((folder) => folder.id === state.activeFolderId && !folder.visible) && (
          <p className="bms-object-hint">Group tujuan akan ditampilkan saat gambar baru selesai.</p>
        )}
        <div className="bms-object-tree" aria-label="Daftar objek BMS">
          {state.folders.map((folder) => (
            <FolderGroup
              key={folder.id}
              folder={folder}
              features={state.features.filter((feature) => objectFolder(feature) === folder.id)}
            />
          ))}
          <div className="bms-folder-heading bms-root-heading">
            <button
              type="button"
              aria-label={`${rootCollapsed ? 'Buka' : 'Lipat'} Objek Utama`}
              aria-expanded={!rootCollapsed}
              aria-controls="bms-root-content"
              onClick={() => setRootCollapsed(!rootCollapsed)}
            >
              {rootCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
            <button
              type="button"
              className="bms-folder-name"
              title="Gambar baru ke Objek Utama"
              onClick={() => useMapTools.setState({ activeFolderId: '' })}
            >
              <Layers size={13} />
              <span>OBJEK UTAMA</span>
              <small>{root.length}</small>
            </button>
            <button
              type="button"
              className="bms-visibility-toggle"
              aria-label="Visibilitas Objek Utama"
              aria-pressed={rootVisible}
              disabled={!root.length}
              title={`${rootVisible ? 'Sembunyikan' : 'Tampilkan'} semua Objek Utama`}
              onClick={() => state.controller?.setRootVisible(!rootVisible)}
            >
              {rootVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
          <div
            id="bms-root-content"
            className="bms-folder-content"
            data-collapsed={rootCollapsed}
            aria-hidden={rootCollapsed}
            ref={(element) => {
              if (element) element.inert = rootCollapsed;
            }}
          >
            <div className="bms-folder-children">
              {root.map((feature) => (
                <ObjectRow key={feature.id} feature={feature} />
              ))}
              {!root.length && <p className="bms-object-hint">Belum ada objek utama.</p>}
            </div>
          </div>
        </div>
        {selected && (
          <>
            <button
              type="button"
              className="bms-inspector-heading"
              aria-expanded={state.inspectorOpen}
              onClick={() => useMapTools.setState({ inspectorOpen: !state.inspectorOpen })}
            >
              {state.inspectorOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <strong>PROPERTI OBJEK</strong>
            </button>
            {state.inspectorOpen && (
              <section className="bms-object-inspector" aria-label="BMS object properties">
                <ObjectDetails key={selected.id} feature={selected} />
              </section>
            )}
          </>
        )}
        {!selected && (
          <>
            <button
              type="button"
              className="bms-inspector-heading"
              aria-label="Buka pengaturan gaya"
              aria-expanded={state.styleOpen}
              onClick={() => useMapTools.setState({ styleOpen: !state.styleOpen })}
            >
              {state.styleOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <strong>GAYA GAMBAR BARU</strong>
              <span className="bms-style-swatch" style={{ background: state.color }} />
            </button>
            {state.styleOpen && (
              <section className="bms-object-inspector" aria-label="Gaya gambar BMS">
                <DrawingStyleFields />
              </section>
            )}
          </>
        )}
        {state.syncStatus !== 'synced' && (
          <div className="bms-object-hint bms-storage-note" role="status">
            {state.syncMessage}
            {(state.syncStatus === 'conflict' || state.syncStatus === 'error') && (
              <button
                type="button"
                aria-label="Muat versi server"
                onClick={() => state.reloadShared?.()}
                title="Simpan salinan lokal sebagai cadangan, lalu muat data server"
              >
                Muat versi server
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function BmsObjectsPanel() {
  const editable = useAuth((state) => Boolean(state.user?.permissions.includes('objects.write')));
  const features = useMapTools((state) => state.features);
  const controller = useMapTools((state) => state.controller);
  if (editable) return <EditableObjectsPanel />;
  return (
    <section className="readonly-objects">
      <h4>Objects</h4>
      {features.map((feature) => (
        <button key={feature.id} onClick={() => controller?.focusDrawing(feature.id!)}>
          {String(feature.properties.name || feature.id)}
        </button>
      ))}
    </section>
  );
}
