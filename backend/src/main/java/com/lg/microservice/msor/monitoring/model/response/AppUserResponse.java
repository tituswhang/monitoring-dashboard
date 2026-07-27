package com.lg.microservice.msor.monitoring.model.response;

import java.time.LocalDateTime;
import java.util.List;

/**
 * One row of the user-admin table.
 *
 * @param roles the roles granted to them, e.g. {@code ["EDITOR"]}
 * @param active false once deactivated — they keep their login but resolve to the default role
 * @param bootstrapAdmin true when their admin rights come from {@code auth.roles.bootstrap-admins}
 *     rather than from a row. Such a user cannot be edited here, and may have no row at all; they are
 *     listed anyway, because an admin screen that omits some of the admins is worse than useless.
 * @param lastLoginAt when they last signed in, or null if they never have. Null is the meaningful
 *     case: it distinguishes someone invited but not yet arrived from someone actually using the app.
 */
public record AppUserResponse(
        String email,
        String name,
        List<String> roles,
        boolean active,
        boolean bootstrapAdmin,
        LocalDateTime createdAt,
        LocalDateTime lastLoginAt) {
}
