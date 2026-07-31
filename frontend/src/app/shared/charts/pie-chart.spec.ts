import { pieGeometry, sliceValueLabel } from './pie-chart';

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

/**
 * The legend is drawn inside the ECharts canvas, so it has to be given its own band
 * and the pie sized to what is left. Without that, a chart with many wedges grows its
 * legend upward until it overlaps them — which is exactly the bug this replaced.
 */
describe('pieGeometry', () => {
  it('uses the whole canvas when there is no legend', () => {
    const g = pieGeometry(220, 80, false);
    expect(g.legendHeight).toBe(0);
    expect(g.centerY).toBe(110);
    expect(g.radius).toBe(80);
  });

  it('reserves a band for the legend and lifts the pie above it', () => {
    const withOut = pieGeometry(220, 80, false);
    const withIn = pieGeometry(220, 80, true);
    expect(withIn.legendHeight).toBeGreaterThan(0);
    // The pie sits higher, and entirely clear of the band.
    expect(withIn.centerY).toBeLessThan(withOut.centerY);
    expect(withIn.centerY + withIn.radius).toBeLessThanOrEqual(220 - withIn.legendHeight);
  });

  it('honours the requested radius when the space allows', () => {
    // 300px tall leaves ample room for an 80px radius plus the legend band.
    expect(pieGeometry(300, 80, true).radius).toBe(80);
  });

  it('shrinks the radius rather than letting the pie reach the legend', () => {
    // 140px tall cannot fit an 80px radius above the band, so it must give.
    const g = pieGeometry(140, 80, true);
    expect(g.radius).toBeLessThan(80);
    expect(g.centerY + g.radius).toBeLessThanOrEqual(140 - g.legendHeight);
  });

  it('never returns a degenerate radius on a very short card', () => {
    const g = pieGeometry(40, 80, true);
    expect(g.radius).toBeGreaterThan(0);
  });

  // The label fit rule is judged against the radius actually drawn, so the two must
  // agree — a label sized for 80px on a pie drawn at 45px would overflow its wedge.
  it('feeds the drawn radius into the label fit rule', () => {
    const g = pieGeometry(140, 80, true);
    expect(sliceValueLabel({ value: 12345, percent: 4 }, g.radius)).toBe('');
    expect(sliceValueLabel({ value: 7, percent: 50 }, g.radius)).toBe('7');
  });
});
