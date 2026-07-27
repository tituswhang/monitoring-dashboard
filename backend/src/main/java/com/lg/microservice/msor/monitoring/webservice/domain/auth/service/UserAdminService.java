package com.lg.microservice.msor.monitoring.webservice.domain.auth.service;

import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.model.request.InviteUserRequest;
import com.lg.microservice.msor.monitoring.model.response.AppUserResponse;
import com.lg.microservice.msor.monitoring.model.response.InviteUserResponse;

import java.util.List;

/**
 * User and role administration, owned by this application rather than by AWS. This is the interface
 * that makes the whole change worth making: an admin grants and revokes roles here, from the
 * dashboard, and it takes effect within a couple of minutes without the user signing out.
 */
public interface UserAdminService {

    /** Every user, with their roles. Includes bootstrap admins, who may have no row of their own. */
    List<AppUserResponse> listUsers();

    /**
     * Grants an email its roles ahead of time and returns the dashboard link to send them. Creates no
     * account anywhere: the pool allows self-signup, so the invitee registers themselves, and the
     * roles waiting against their email bind on arrival. Re-inviting an existing user just resets
     * their roles.
     *
     * @param request the invitee's email, optional name, and roles to grant
     * @param actor the admin doing the inviting, recorded on the rows they create
     */
    InviteUserResponse invite(InviteUserRequest request, AuthenticatedUser actor);

    /**
     * Notes that a user has arrived: stamps their last sign-in and records the provider subject for
     * audit. Creates a row for someone who signed themselves up without an invite, so that the admin
     * table shows everyone who can actually use the app rather than only those an admin knew about.
     *
     * @param user the caller's resolved identity
     * @param subject their provider subject, stored for audit only
     */
    void recordSignIn(AuthenticatedUser user, String subject);

    /**
     * Replaces a user's entire role set.
     *
     * @param email the user to change
     * @param roleNames the roles they should end up with — not a delta
     * @param actor the admin making the change, recorded on the grants
     * @throws com.lg.microservice.msor.monitoring.common.exception.RoleAssignmentException if this
     *     would demote the acting admin or remove the last one
     */
    AppUserResponse replaceRoles(String email, List<String> roleNames, AuthenticatedUser actor);

    /**
     * Deactivates a user: they keep their login, but hold no roles and fall back to the default one.
     * Deliberately not a delete — the activity timeline attributes past work to them by email, and
     * that history should survive their departure.
     *
     * @param email the user to deactivate
     * @param actor the admin making the change
     * @throws com.lg.microservice.msor.monitoring.common.exception.RoleAssignmentException if this
     *     would deactivate the acting admin or the last one
     */
    void deactivate(String email, AuthenticatedUser actor);
}
