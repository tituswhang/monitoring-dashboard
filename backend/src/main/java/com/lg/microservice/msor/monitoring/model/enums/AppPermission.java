package com.lg.microservice.msor.monitoring.model.enums;

/**
 * A single thing a user may do. Endpoints are guarded by {@link AppRole} (via {@code hasRole}), so
 * permissions exist for the frontend's benefit: {@code /v1/auth/me} returns them so the UI can hide
 * a control the caller would only get a 403 from.
 */
public enum AppPermission {

    /** Read monitoring queries, results, cases, and KPI. */
    CASE_READ,

    /** Update result-row status and post comments on a case's timeline. */
    CASE_WRITE,

    /** Create, edit, delete, hold, and run monitoring queries. */
    QUERY_MANAGE,

    /** Invite users and assign their roles. */
    USER_MANAGE
}
