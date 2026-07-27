package com.lg.microservice.msor.monitoring.common.security;

/**
 * The acting user behind a request, in the form the activity timeline stores authors:
 * a human-readable {@code name} and a stable {@code email} identity. Both are null when
 * the request is unauthenticated (auth disabled / demo mode), which renders as "Unknown".
 *
 * <p>Neither field ever holds an opaque Cognito subject/username UUID.
 */
public record AuthenticatedUser(String name, String email) {

    private static final AuthenticatedUser ANONYMOUS = new AuthenticatedUser(null, null);

    public static AuthenticatedUser anonymous() {
        return ANONYMOUS;
    }
}
