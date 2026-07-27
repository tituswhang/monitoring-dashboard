package com.lg.microservice.msor.monitoring.model.response;

import java.util.List;

/**
 * Who touched which case during one calendar month.
 *
 * <p>The month scopes the <em>touch</em>, not the case: a case first seen in June counts in July
 * only if somebody did something to it in July. A case worked in July and left alone in August is
 * absent from every August list, which is what lets the client render it as unattended.
 *
 * <p>Two buckets are deliberately not here. <em>Unattended</em> cases (nobody touched them) cannot
 * be computed from the activity timeline at all — they are the case rows this response never
 * mentions, and only the client, which holds the rows, can subtract. <em>Dormant</em> cases
 * (finished earlier, untouched since) fall out of the same subtraction.
 *
 * @param month         the month answered, {@code yyyy-MM}. Echoed so a client never has to guess
 *                      what the server considers "current"
 * @param earliestMonth the first month holding any human activity, {@code yyyy-MM}; null when the
 *                      timeline is empty. Months before it were never tracked, and must not render
 *                      as a team that did nothing
 * @param people        one entry per person who touched a case this month
 * @param unattributed  cases touched this month only by entries with no author. Never folded into a
 *                      person's list, and never a person's fault
 */
public record CaseWorkloadResponse(
        String month,
        String earliestMonth,
        List<PersonWorkload> people,
        List<CaseRef> unattributed) {
}
