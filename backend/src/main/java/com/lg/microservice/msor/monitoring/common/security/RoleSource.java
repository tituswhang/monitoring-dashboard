package com.lg.microservice.msor.monitoring.common.security;

/**
 * Where a request's roles come from. Exists so the move off Cognito groups can be rolled out one
 * environment at a time rather than in a single flag-day deploy.
 *
 * <p>The intended path is {@link #BOTH} (ship the tables, nothing changes) → {@link #DB} (Cognito
 * groups stop mattering) → delete {@link #COGNITO} and this enum with it.
 */
public enum RoleSource {

    /** Roles come only from {@code app_user_role}. The end state. */
    DB,

    /** Roles come only from the legacy {@code cognito:groups} claim. The state before this change. */
    COGNITO,

    /** The union of both. Non-breaking, so it is the default during the transition. */
    BOTH;

    public boolean usesDatabase() {
        return this == DB || this == BOTH;
    }

    public boolean usesCognitoGroups() {
        return this == COGNITO || this == BOTH;
    }
}
