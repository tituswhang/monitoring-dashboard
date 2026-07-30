import type { RowStatus } from '../../core/models/monitoring';

export const STATUS_OPTIONS: { value: RowStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
];

export function statusSelectClass(status: RowStatus): string {
  if (status === 'IN_PROGRESS') {
    return 'border-amber-400/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-600/40';
  }
  if (status === 'DONE') {
    return 'border-green-400/50 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400 dark:border-green-600/40';
  }
  return 'border-border bg-muted/60 text-muted-foreground';
}
