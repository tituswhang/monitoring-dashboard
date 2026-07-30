import { Directive, computed, input } from '@angular/core';
import { cn } from '../utils/cn';

/** Loading placeholder. Angular Material has no equivalent, so this stays custom. */
@Directive({
  selector: '[uiSkeleton]',
  host: { '[class]': 'hostClass()' },
})
export class SkeletonDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() => cn('animate-pulse rounded-md bg-muted', this.userClass()));
}
