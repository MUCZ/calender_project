import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Close } from './icons';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional description rendered under the title. */
  description?: ReactNode;
  size?: 'sm' | 'md';
  /** Selector of the element to focus first (defaults to the first focusable field). */
  initialFocus?: string;
  className?: string;
}

/**
 * Accessible modal built on the native <dialog> element (focus trapping, Escape,
 * inert background), restoring focus to the trigger when closed.
 */
export function Dialog({ title, onClose, children, footer, description, size = 'md', initialFocus, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    const target =
      (initialFocus && dialog.querySelector<HTMLElement>(initialFocus)) ||
      dialog.querySelector<HTMLElement>('[data-autofocus]') ||
      dialog.querySelector<HTMLElement>('input, select, textarea, button:not(.dialog-close)');
    target?.focus();
    return () => {
      if (dialog.open) dialog.close();
      // Return focus to the trigger unless another component already moved it.
      window.setTimeout(() => {
        if (previouslyFocused?.isConnected && (document.activeElement === document.body || !document.activeElement)) {
          previouslyFocused.focus();
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size} ${className ?? ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current();
      }}
      onMouseDown={(e) => {
        // Click on the backdrop closes the dialog.
        if (e.target === ref.current) onCloseRef.current();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn dialog-close" aria-label="Close" onClick={() => onCloseRef.current()}>
            <Close />
          </button>
        </header>
        {description && (
          <p id={descId} className="dialog-desc">
            {description}
          </p>
        )}
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
