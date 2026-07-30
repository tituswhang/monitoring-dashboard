// The bug this guards against is the browser's *time zone*, not its clock: run_date is a
// New York calendar date, and a browser in Seoul would bucket a case a day early. Pinning
// the zone fixes exactly that, needs no round trip, and — because it re-evaluates on every
// call — never goes stale across midnight the way a fetched date would.

const APP_TIME_ZONE = 'America/New_York';

const NY_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in the application's zone, as `yyyy-MM-dd`. Never use `new Date()` instead. */
export function nyToday(): string {
  const parts = Object.fromEntries(
    NY_DATE_FORMAT.formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

/** The current month in the application's zone, as `yyyy-MM`. Never derive this from `new Date()`. */
export function nyMonth(): string {
  return nyToday().slice(0, 7);
}
