import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BadgeDirective } from './badge';

@Component({
  imports: [BadgeDirective],
  template: `
    <span uiBadge data-testid="plain">plain</span>
    <span uiBadge variant="destructive" data-testid="variant">variant</span>
    <span uiBadge variant="destructive" class="h-4 px-1 py-0" data-testid="override">override</span>
  `,
})
class Host {}

function classesOf(testId: string): string[] {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  return Array.from(el.classList);
}

describe('BadgeDirective', () => {
  it('applies the base classes', () => {
    expect(classesOf('plain')).toContain('rounded-full');
    expect(classesOf('plain')).toContain('bg-primary');
  });

  it('applies the selected variant instead of the default', () => {
    const classes = classesOf('variant');
    expect(classes).toContain('bg-destructive');
    expect(classes).not.toContain('bg-primary');
  });

  // The load-bearing case. Callers override base spacing (the React source has
  // `<Badge className="h-4 shrink-0 px-1 py-0 …">` on top of a base `px-2 py-0.5`).
  // Without tailwind-merge both survive and Tailwind's emit order picks the winner
  // rather than the caller.
  it('lets a caller class override a conflicting base utility', () => {
    const classes = classesOf('override');
    expect(classes).toContain('px-1');
    expect(classes).toContain('py-0');
    expect(classes).not.toContain('px-2');
    expect(classes).not.toContain('py-0.5');
    // Non-conflicting base classes must survive the merge.
    expect(classes).toContain('rounded-full');
    expect(classes).toContain('bg-destructive');
  });
});
