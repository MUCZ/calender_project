import { useState } from 'react';
import type { CalendarCategory } from '../lib/types';
import { Dialog } from './Dialog';
import { Check } from './icons';

export const PALETTE = ['#3b6fd4', '#2f9465', '#8a5cc7', '#d07a2a', '#c94f6d', '#1f8a9e', '#7a8597', '#b8892b'];

interface Props {
  calendar?: CalendarCategory;
  canDelete: boolean;
  onSave: (values: { name: string; color: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function CalendarDialog({ calendar, canDelete, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(calendar?.name ?? '');
  const [color, setColor] = useState(calendar?.color ?? PALETTE[4]);
  const [confirming, setConfirming] = useState(false);
  const valid = name.trim().length > 0;
  return (
    <Dialog
      title={calendar ? 'Edit calendar' : 'New calendar'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          {calendar && canDelete && (
            <button type="button" className={confirming ? 'btn btn-danger' : 'btn btn-danger-ghost'} onClick={() => (confirming ? onDelete?.() : setConfirming(true))}>
              {confirming ? 'Confirm delete' : 'Delete'}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="calendar-form" className="btn btn-primary" disabled={!valid}>
            Save
          </button>
        </>
      }
    >
      <form
        id="calendar-form"
        className="calendar-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave({ name: name.trim(), color });
        }}
      >
        <label className="stacked-label">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Side project" data-autofocus maxLength={40} />
        </label>
        <div className="stacked-label">
          <span id="color-label">Color</span>
          <div className="swatches" role="radiogroup" aria-labelledby="color-label">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={c}
                className={`swatch${c === color ? ' is-selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              >
                {c === color && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
        {confirming && <p className="hint">Events in this calendar will move to another calendar. You can undo this.</p>}
      </form>
    </Dialog>
  );
}
