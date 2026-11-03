import { useMapTools, type DrawMode } from './mapToolsStore';

const hints: Record<Exclude<DrawMode, 'render'>, [string, string]> = {
  select: ['Pilih / edit objek', 'Klik gambar untuk edit · Geser area kosong untuk navigasi'],
  point: ['Menandai titik', 'Klik peta untuk menambahkan titik'],
  linestring: ['Menggambar garis', 'Klik untuk tambah titik · Klik dua kali untuk selesai'],
  polygon: ['Menggambar polygon', 'Klik untuk tambah titik · Klik titik pertama untuk selesai'],
  rectangle: ['Menggambar kotak', 'Klik sudut awal, lalu klik sudut seberangnya'],
  circle: ['Menggambar lingkaran', 'Klik pusat, lalu klik untuk menentukan radius'],
};

export default function BmsDrawingHint() {
  const mode = useMapTools((state) => state.mode);
  if (mode === 'render') return null;
  const [title, instruction] = hints[mode];
  return (
    <div className="bms-drawing-hint" role="status">
      <strong>
        {title}
        <span>Esc · Keluar</span>
      </strong>
      <span>{instruction}</span>
    </div>
  );
}
