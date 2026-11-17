import { Dialog } from './Dialog';
import { modKey } from './hooks';

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'Navigation',
    items: [
      [['T'], 'Go to today'],
      [['J', '←'], 'Previous period'],
      [['K', '→'], 'Next period'],
      [['D'], 'Day view'],
      [['W'], 'Week view'],
      [['M'], 'Month view'],
      [['/'], 'Search'],
    ],
  },
  {
    title: 'Events',
    items: [
      [['C'], 'Create event'],
      [['Tab'], 'Move between events'],
      [['Enter'], 'Open focused event'],
      [['↑', '↓'], 'Move 15 minutes (week/day) or a week (month)'],
      [['←', '→'], 'Move a day'],
      [['Shift', '↑ / ↓'], 'Change duration'],
      [['Delete'], 'Delete focused event'],
      [['Esc'], 'Cancel drag / close dialog'],
    ],
  },
  {
    title: 'History',
    items: [
      [[modKey, 'Z'], 'Undo'],
      [[modKey, 'Shift', 'Z'], 'Redo'],
      [['?'], 'Show shortcuts'],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} initialFocus=".dialog-close">
      <div className="shortcuts">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.items.map(([keys, label]) => (
                <div key={label} className="shortcut-row">
                  <dt>
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
