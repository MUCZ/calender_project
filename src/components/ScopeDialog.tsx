import { useState } from 'react';
import { formatShortDate } from '../lib/dates';
import type { EditScope, Occurrence } from '../lib/types';
import { Dialog } from './Dialog';

interface Props {
  action: 'edit' | 'move' | 'delete';
  occ: Occurrence;
  /** When false, only "Entire series" is possible (e.g. the repeat rule itself changed). */
  allowSingle: boolean;
  onConfirm: (scope: EditScope) => void;
  onClose: () => void;
}

const COPY = {
  edit: { title: 'Save changes to recurring event', confirm: 'Save' },
  move: { title: 'Reschedule recurring event', confirm: 'Move' },
  delete: { title: 'Delete recurring event', confirm: 'Delete' },
};

export function ScopeDialog({ action, occ, allowSingle, onConfirm, onClose }: Props) {
  const [scope, setScope] = useState<EditScope>(allowSingle ? 'single' : 'series');
  const copy = COPY[action];
  const date = formatShortDate(occ.start);
  const verb = action === 'delete' ? 'deleted' : 'changed';
  return (
    <Dialog
      title={copy.title}
      size="sm"
      onClose={onClose}
      description={<>“{occ.title}” repeats weekly. Which events should be {verb}?</>}
      initialFocus={`input[value="${scope}"]`}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`btn ${action === 'delete' ? 'btn-danger' : 'btn-primary'}`} onClick={() => onConfirm(scope)}>
            {copy.confirm}
          </button>
        </>
      }
    >
      <form
        className="scope-options"
        role="radiogroup"
        aria-label="Apply to"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(scope);
        }}
      >
        <label className={`scope-option${scope === 'single' ? ' is-selected' : ''}${allowSingle ? '' : ' is-disabled'}`}>
          <input type="radio" name="scope" value="single" checked={scope === 'single'} disabled={!allowSingle} onChange={() => setScope('single')} />
          <span>
            <strong>This occurrence only</strong>
            <small>{allowSingle ? `Only ${date} is ${verb}. Other occurrences stay as they are.` : 'Not available when changing how the event repeats.'}</small>
          </span>
        </label>
        <label className={`scope-option${scope === 'series' ? ' is-selected' : ''}`}>
          <input type="radio" name="scope" value="series" checked={scope === 'series'} onChange={() => setScope('series')} />
          <span>
            <strong>Entire series</strong>
            <small>{action === 'delete' ? 'Every occurrence, past and future, is deleted.' : 'Every occurrence in the series is updated.'}</small>
          </span>
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
