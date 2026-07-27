package com.lg.microservice.msor.monitoring.model.response;

import java.util.List;

/**
 * The distinct cases one person touched during the requested month.
 *
 * <p>Membership is not exclusive: a case two people both touched appears in both of their lists.
 * Summing {@code cases.size()} across people therefore over-counts, and is never a case count.
 *
 * @param authorEmail the stable identity, and the grouping key
 * @param authorName  display name; null when the user has no Cognito {@code name} attribute, in
 *                    which case the client falls back to the email
 * @param isYou       true when this person is the caller. Resolved server-side because the frontend
 *                    cannot identify itself: Cognito omits {@code email} from access tokens
 * @param cases       the cases they touched, ordered by item then case key
 */
public record PersonWorkload(String authorEmail, String authorName, boolean isYou, List<CaseRef> cases) {
}
