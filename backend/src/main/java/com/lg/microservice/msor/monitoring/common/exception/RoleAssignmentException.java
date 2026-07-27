package com.lg.microservice.msor.monitoring.common.exception;

/**
 * A role change that is well-formed but must not happen — removing the last admin, or an admin
 * demoting themselves. Distinct from {@link IllegalStateException}, which the admin endpoints already
 * use to mean "the identity provider is not configured" and answer with a 503; these are the caller's
 * fault, not the deployment's, and answer with a 409.
 */
public class RoleAssignmentException extends RuntimeException {

    public RoleAssignmentException(String message) {
        super(message);
    }
}
