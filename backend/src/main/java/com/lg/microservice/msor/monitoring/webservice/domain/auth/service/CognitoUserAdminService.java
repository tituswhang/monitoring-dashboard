package com.lg.microservice.msor.monitoring.webservice.domain.auth.service;

import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;

import java.util.Optional;

/**
 * The identity provider, reduced to the one thing only it can answer: who a token belongs to.
 *
 * <p>It used to own group membership, which is how authorization ended up living in AWS, and it used
 * to create logins. Neither is true now: roles are this application's own ({@link UserAdminService}),
 * and the pool allows self-signup, so an invitee registers themselves. Nothing below decides what a
 * user may do, and nothing below sits on the invite path.
 */
public interface CognitoUserAdminService {

    /**
     * Looks up a pool member by their token subject. On a pool that signs in by email alias — which
     * this one is — Cognito's native username for a user <em>is</em> their subject UUID, so the
     * subject can be passed straight to {@code AdminGetUser}.
     *
     * @param subject the {@code sub} claim of a token issued to the user
     * @return the user's display name and email, or empty when the user no longer exists or carries
     *     neither attribute
     */
    Optional<AuthenticatedUser> findBySubject(String subject);
}
