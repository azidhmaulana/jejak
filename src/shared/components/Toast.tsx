import { create } from 'zustand';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import './Toast.css';
type Notice = { id: number; message: string; kind: 'success' | 'error' };
const useToasts = create<{ items: Notice[] }>(() => ({ items: [] }));
let serial = 0;
export function toast(message: string, kind: Notice['kind'] = 'success') {
  if (useToasts.getState().items.some((item) => item.message === message)) return;
  const id = ++serial;
  useToasts.setState((state) => ({ items: [...state.items.slice(-2), { id, message, kind }] }));
  setTimeout(() => dismiss(id), 6000);
}
function dismiss(id: number) {
  useToasts.setState((state) => ({ items: state.items.filter((item) => item.id !== id) }));
}
export default function ToastHost() {
  const items = useToasts((state) => state.items);
  return (
    <div className="toast-stack" translate="no">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast-item ${item.kind}`}
          role={item.kind === 'error' ? 'alert' : 'status'}
        >
          {item.kind === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{item.message}</span>
          <button aria-label="Close notification" onClick={() => dismiss(item.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
