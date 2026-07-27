package com.lg.microservice.msor.monitoring.model.enums;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * What a user may do, resolved from this application's own tables rather than from a
 * {@code cognito:groups} claim. Membership is data ({@code app_user_role}); the catalog below
 * is code, because adding a role only means anything once some endpoint checks for it.
 *
 * <p>Each role maps to the Spring Security authority {@code ROLE_<name>}, so {@code hasRole("ADMIN")}
 * and {@code @PreAuthorize} work unchanged.
 */
public enum AppRole {

    /** Read-only. What a user with no roles granted to them falls back to. */
    VIEWER(EnumSet.of(AppPermission.CASE_READ)),

    /** Works cases day to day: everything a viewer can do, plus writes. */
    EDITOR(EnumSet.of(AppPermission.CASE_READ, AppPermission.CASE_WRITE, AppPermission.QUERY_MANAGE)),

    /** Everything, including inviting users and assigning their roles. */
    ADMIN(EnumSet.allOf(AppPermission.class));

    public static final String AUTHORITY_PREFIX = "ROLE_";

    private final Set<AppPermission> permissions;

    AppRole(Set<AppPermission> permissions) {
        this.permissions = Collections.unmodifiableSet(permissions);
    }

    public Set<AppPermission> permissions() {
        return permissions;
    }

    public String authority() {
        return AUTHORITY_PREFIX + name();
    }

    /**
     * Parses a role name off a database row or a JWT group claim, tolerating case and surrounding
     * whitespace. Unknown names yield an empty optional rather than an exception: a Cognito group
     * that does not correspond to an app role (or a role deleted from this enum while rows still
     * reference it) must be ignored, not fatal.
     */
    public static Optional<AppRole> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(value.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
