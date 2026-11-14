import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

/** Bottom sheet. Tap the backdrop or press Escape to close. */
export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);
  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div class="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div class="row-between">
          <strong>{props.title}</strong>
          <button class="btn small" onClick={props.onClose}>Close</button>
        </div>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>
  );
}
