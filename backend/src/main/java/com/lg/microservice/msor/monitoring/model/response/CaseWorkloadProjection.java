package com.lg.microservice.msor.monitoring.model.response;

/**
 * Projection for one {@code (person, case)} pair touched inside a time window — the cases a person
 * commented on or changed the status of. The query groups by author and case, so repeat touches
 * collapse: nine comments on one case in one month yield one row.
 *
 * <p>{@code authorEmail} is null for entries carrying no author — writes made while auth is disabled,
 * and the legacy row comments {@code V1_0_9} backfilled. Those rows group together and are split out
 * as unattributed rather than credited to anybody.
 *
 * <p>{@code authorName} is {@code MAX(author_name)} over the group. The name is nullable and mutable
 * while the email is not, so the email is the grouping key and the name is only for display.
 */
public interface CaseWorkloadProjection {

    String getAuthorEmail();

    String getAuthorName();

    Integer getMsorId();

    String getCaseKey();
}
