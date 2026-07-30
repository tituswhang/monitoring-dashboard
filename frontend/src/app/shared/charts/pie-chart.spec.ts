import { sliceValueLabel } from './pie-chart';

/**
 * The React original judged fit with `percent` in 0–1; ECharts reports 0–100. This
 * suite pins the translation, since an off-by-100 here fails silently — every label
 * would render (or none would), which looks plausible until you compare side by side.
 *
 * Reference rule, at outerRadius 80 → labelRadius 44:
 *   arcWidth = (percent/100) * 2π * 44
 *   labelWidth = digits * 7 + 6
 */
describe('sliceValueLabel', () => {
  const RADIUS = 80;

  it('renders the value on a wedge with room for it', () => {
    // 25% → arc ≈ 69px, label for "12" = 20px. Comfortable fit.
    expect(sliceValueLabel({ value: 12, percent: 25 }, RADIUS)).toBe('12');
  });

  it('renders nothing on a wedge too slim to hold the number', () => {
    // 2% → arc ≈ 5.5px, label for "3" = 13px. No room.
    expect(sliceValueLabel({ value: 3, percent: 2 }, RADIUS)).toBe('');
  });

  it('accounts for digit count, not just wedge size', () => {
    // Same wedge; a wider number stops fitting where a narrow one still does.
    // 6% → arc ≈ 16.6px. "9" needs 13px (fits); "123456" needs 48px (does not).
    expect(sliceValueLabel({ value: 9, percent: 6 }, RADIUS)).toBe('9');
    expect(sliceValueLabel({ value: 123456, percent: 6 }, RADIUS)).toBe('');
  });

  it('scales the threshold with the radius', () => {
    // A wedge that does not fit at r=40 fits at r=160, same percentage.
    expect(sliceValueLabel({ value: 42, percent: 5 }, 40)).toBe('');
    expect(sliceValueLabel({ value: 42, percent: 5 }, 160)).toBe('42');
  });

  it('treats percent as 0-100, not 0-1', () => {
    // The regression guard: had the 0-1 scale been carried over unchanged, a full
    // wedge would arrive as percent=100 and be divided down to nothing.
    expect(sliceValueLabel({ value: 7, percent: 100 }, RADIUS)).toBe('7');
  });
});
