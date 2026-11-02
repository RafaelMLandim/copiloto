import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { StatusCliente } from '../../shared/tipos';

// ---------- Toasts ----------

type Toast = { id: number; tipo: 'info' | 'ok' | 'erro'; texto: string };
const ToastCtx = createContext<(texto: string, tipo?: Toast['tipo']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const mostrar = useCallback((texto: string, tipo: Toast['tipo'] = 'info') => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l, { id, tipo, texto }]);
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), tipo === 'erro' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      <div className="toasts">
        {lista.map((t) => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            {t.tipo === 'ok' ? <CheckCircle2 size={18} /> : t.tipo === 'erro' ? <XCircle size={18} /> : <Info size={18} />}
            {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- Hook de carregamento ----------

export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T>();
  const [erro, setErro] = useState<string>();
  const [carregando, setCarregando] = useState(true);
  const recarregar = useCallback(() => {
    setCarregando(true);
    return fn()
      .then((d) => {
        setDados(d);
        setErro(undefined);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  return { dados, erro, carregando, recarregar, setDados };
}

// ---------- Pequenos componentes ----------

const CORES = ['#6d5efc', '#12a66a', '#f2994a', '#2f7cf6', '#e0424b', '#a855f7', '#0ea5a4', '#d946ef', '#64748b'];
export function corDoNome(nome: string, cor?: string) {
  if (cor) return cor;
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}
export function iniciais(nome: string) {
  const p = nome.replace(/[–—-].*$/, '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Avatar({ nome, cor, tam }: { nome: string; cor?: string; tam?: 'sm' | 'lg' }) {
  const c = corDoNome(nome, cor);
  return (
    <div className={`avatar ${tam ?? ''}`} style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)` }}>
      {iniciais(nome)}
    </div>
  );
}

export function StatusBadge({ status }: { status: StatusCliente }) {
  const m = { ativo: ['green', 'Ativo'], pausado: ['amber', 'Pausado'], prospect: ['blue', 'Prospect'] } as const;
  const [c, t] = m[status] ?? m.ativo;
  return (
    <span className={`badge ${c}`}>
      <span className="dot" style={{ background: 'currentColor', width: 6, height: 6 }} />
      {t}
    </span>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Field({ label, hint, req, children }: { label: ReactNode; hint?: ReactNode; req?: boolean; children: ReactNode }) {
  return (
    <div className="field">
      <label>
        {label}
        {req && <span className="req">*</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button type="button" key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Modal({ titulo, onClose, children }: { titulo: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="card-head">
          <h3>{titulo}</h3>
          <button className="btn ghost icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (n: number) => Math.round(n).toLocaleString('pt-BR');
export const dataBr = (s: string) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
export function quando(isoStr: string) {
  const d = new Date(isoStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
export function tamanho(b: number) {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
