package com.lg.microservice.msor.monitoring.model.response;

import java.util.List;

/**
 * Result of inviting a user.
 *
 * <p>No account is created anywhere. The pool allows self-signup, so an invitee signs themselves in
 * with their own email; the roles below are written against that email in advance and bind to them
 * the moment they arrive. Pre-assigning a role to someone who does not yet exist is exactly what the
 * old Cognito-group model could not do.
 *
 * @param email the address the roles were granted to
 * @param roles the roles they will hold on arrival
 * @param inviteUrl the dashboard link to send them
 * @param alreadyInvited whether this email was already known here, in which case only roles changed
 */
public record InviteUserResponse(
        String email,
        List<String> roles,
        String inviteUrl,
        boolean alreadyInvited) {
}
