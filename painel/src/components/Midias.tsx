import { useRef, useState } from 'react';
import { Check, FileText, Film, ImageIcon, StickyNote, Trash2, UploadCloud } from 'lucide-react';
import { api } from '../api';
import { Modal, tamanho, useToast } from './ui';
import type { Midia } from '../../shared/tipos';

export function Dropzone({ slug, onEnviado }: { slug: string; onEnviado: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (files: FileList | null) => {
    if (!files?.length) return;
    setEnviando(true);
    try {
      await api.enviarMidias(slug, Array.from(files));
      toast(`${files.length} arquivo(s) adicionado(s) em midias/novas`, 'ok');
      onEnviado();
    } catch (e: any) {
      toast(e.message, 'erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void enviar(e.dataTransfer.files);
      }}
    >
      <UploadCloud size={30} />
      <b>{enviando ? 'Enviando…' : 'Arraste fotos e vídeos aqui ou clique para escolher'}</b>
      <span className="small muted">Ideal: imagem 1080×1350 (feed) ou 1080×1920 (stories/reels) · vídeo vertical até 60s. O nome do arquivo ajuda o Claude a escrever o anúncio.</span>
      <input ref={input} type="file" multiple accept="image/*,video/*,.txt" hidden onChange={(e) => void enviar(e.target.files)} />
    </div>
  );
}

export function MidiaCard({
  slug,
  m,
  selecionada,
  onSelecionar,
  onMudou,
}: {
  slug: string;
  m: Midia;
  selecionada?: boolean;
  onSelecionar?: () => void;
  onMudou?: () => void;
}) {
  const toast = useToast();
  const [editNota, setEditNota] = useState(false);
  const [nota, setNota] = useState(m.nota ?? '');
  const url = api.midiaUrl(slug, m.pasta, m.nome);

  const salvarNota = async () => {
    try {
      await api.salvarNota(slug, m.nome, nota);
      toast('Anotação salva', 'ok');
      setEditNota(false);
      onMudou?.();
    } catch (e: any) {
      toast(e.message, 'erro');
    }
  };
  const apagar = async () => {
    if (!confirm(`Apagar "${m.nome}" da pasta ${m.pasta}?`)) return;
    try {
      await api.apagarMidia(slug, m.pasta, m.nome);
      onMudou?.();
    } catch (e: any) {
      toast(e.message, 'erro');
    }
  };

  return (
    <div className={`media ${onSelecionar ? 'selectable' : ''} ${selecionada ? 'on' : ''}`} onClick={onSelecionar}>
      <div className="thumb">
        {m.tipo === 'imagem' && <img src={url} loading="lazy" alt={m.nome} />}
        {m.tipo === 'video' && <video src={url} muted preload="metadata" onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} />}
        {m.tipo === 'texto' && <FileText size={30} />}
        {m.tipo === 'outro' && <ImageIcon size={30} />}
      </div>
      <span className="tag badge" style={{ background: 'rgba(15,18,36,.7)', color: '#fff' }}>
        {m.tipo === 'video' ? <Film size={11} /> : <ImageIcon size={11} />} {m.tipo === 'video' ? 'vídeo' : m.tipo}
      </span>
      {onSelecionar && <span className="sel">{selecionada && <Check size={14} />}</span>}
      <div className="info">
        <b title={m.nome}>{m.nome}</b>
        <span className="muted">{tamanho(m.tamanho)}</span>
        {m.nota && <span className="small" style={{ color: 'var(--text-2)' }}>📝 {m.nota.slice(0, 80)}</span>}
        {!onSelecionar && (
          <div className="row" style={{ marginTop: 4 }}>
            {m.pasta === 'novas' && (
              <button className="btn sm ghost" onClick={() => setEditNota(true)} title="Anotação (preço, bairro, condição)">
                <StickyNote size={13} /> Nota
              </button>
            )}
            <span className="spacer" />
            <button className="btn sm ghost danger icon" onClick={apagar} title="Apagar">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
      {editNota && (
        <Modal titulo={`Anotação: ${m.nome}`} onClose={() => setEditNota(false)}>
          <p className="muted small" style={{ margin: 0 }}>Fica salva como .txt ao lado da mídia — o Claude lê ao escrever o anúncio (preço, bairro, condição, o que destacar).</p>
          <textarea className="textarea" rows={5} autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: Casa 3 quartos, Jardim Europa, R$ 480 mil, aceita FGTS" />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setEditNota(false)}>Cancelar</button>
            <button className="btn primary" onClick={salvarNota}>Salvar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
