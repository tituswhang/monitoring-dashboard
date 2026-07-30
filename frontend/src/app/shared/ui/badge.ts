import { Directive, computed, input } from '@angular/core';
import { cn } from '../utils/cn';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning';

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  destructive: 'bg-destructive text-white',
  outline: 'border border-border text-foreground bg-transparent',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
};

const BASE = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-none';

@Directive({
  selector: '[uiBadge]',
  host: { '[class]': 'hostClass()' },
})
export class BadgeDirective {
  readonly variant = input<BadgeVariant>('default');
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly hostClass = computed(() =>
    cn(BASE, VARIANTS[this.variant()], this.userClass()),
  );
}
