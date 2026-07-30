import { Directive, computed, input } from '@angular/core';
import { cn } from '../utils/cn';

/*
 * Attribute directives rather than wrapper components, so the host stays a native
 * element — `<h3 uiCardTitle>` keeps its heading semantics, and the table primitives
 * next door keep a real <table>/<thead>/<tr> tree.
 *
 * Each takes a `class`-aliased input and merges it through `cn()`. That merge is
 * load-bearing, not decoration: callers override base utilities (e.g. a Badge with
 * `px-1 py-0` on top of the base `px-2 py-0.5`), and without tailwind-merge both
 * would survive and Tailwind's own emit order would decide the winner instead of
 * the caller.
 */

@Directive({
  selector: '[uiCard]',
  host: { '[class]': 'hostClass()' },
})
export class CardDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() =>
    cn('rounded-lg border bg-card text-card-foreground shadow-xs', this.userClass()),
  );
}

@Directive({
  selector: '[uiCardHeader]',
  host: { '[class]': 'hostClass()' },
})
export class CardHeaderDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() => cn('flex flex-col gap-1.5 p-5 pb-0', this.userClass()));
}

@Directive({
  selector: '[uiCardTitle]',
  host: { '[class]': 'hostClass()' },
})
export class CardTitleDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() => cn('text-sm font-semibold leading-none', this.userClass()));
}

@Directive({
  selector: '[uiCardDescription]',
  host: { '[class]': 'hostClass()' },
})
export class CardDescriptionDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() =>
    cn('text-xs text-muted-foreground mt-0.5', this.userClass()),
  );
}

@Directive({
  selector: '[uiCardContent]',
  host: { '[class]': 'hostClass()' },
})
export class CardContentDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() => cn('p-5 pt-4', this.userClass()));
}

export const CARD_DIRECTIVES = [
  CardDirective,
  CardHeaderDirective,
  CardTitleDirective,
  CardDescriptionDirective,
  CardContentDirective,
] as const;
