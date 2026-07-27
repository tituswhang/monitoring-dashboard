package com.lg.microservice.msor.monitoring.common.security;

import com.lg.microservice.msor.monitoring.model.enums.AppRole;
import lombok.RequiredArgsConstructor;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Turns a validated token into an authenticated principal with authorities.
 *
 * <p>The authorities no longer come from the token. Roles are looked up from this application's own
 * tables, keyed on the user's email — so an admin can grant or revoke a role from the dashboard and
 * have it take effect without the user signing out, and so replacing the identity provider does not
 * mean rewriting authorization. What the token supplies is identity, nothing more.
 *
 * <p>{@code auth.roles.source} decides whether the legacy {@code cognito:groups} claim is still
 * honoured alongside the database ({@link RoleSource#BOTH}, the transitional default) or ignored
 * ({@link RoleSource#DB}, the end state).
 */
@Component
@RequiredArgsConstructor
public class AppJwtConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private static final String GROUPS_CLAIM = "cognito:groups";

    private final AuthenticatedUserResolver authenticatedUserResolver;
    private final RoleResolver roleResolver;
    private final AuthRoleProperties roleProperties;

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        String principalName = resolvePrincipalName(jwt);
        return new JwtAuthenticationToken(jwt, mapAuthorities(jwt), principalName);
    }

    private Collection<GrantedAuthority> mapAuthorities(Jwt jwt) {
        RoleSource source = roleProperties.getSource();
        Set<String> authorities = new LinkedHashSet<>();

        if (source.usesDatabase()) {
            authorities.addAll(databaseAuthorities(jwt));
        }
        if (source.usesCognitoGroups()) {
            authorities.addAll(cognitoGroupAuthorities(jwt));
        }

        return authorities.stream()
                .map(authority -> (GrantedAuthority) new SimpleGrantedAuthority(authority))
                .toList();
    }

    /**
     * The caller's app-managed roles. Identity is resolved through {@link AuthenticatedUserResolver}
     * rather than read off a claim, because a Cognito access token from a pool that signs in by email
     * alias carries no email at all — only opaque UUIDs. Both resolvers cache, so the common case
     * costs no round trips.
     */
    private Set<String> databaseAuthorities(Jwt jwt) {
        AuthenticatedUser user = authenticatedUserResolver.resolveFromToken(jwt);
        Set<String> authorities = new LinkedHashSet<>();
        for (AppRole role : roleResolver.resolve(user.email())) {
            authorities.add(role.authority());
        }
        return authorities;
    }

    /**
     * Legacy: each Cognito group becomes {@code ROLE_<group>}. Retained only so that flipping
     * {@code auth.roles.source} to {@code db} is a config change rather than a coordinated cutover.
     * Delete with phase 4.
     */
    private Set<String> cognitoGroupAuthorities(Jwt jwt) {
        List<String> groups = jwt.getClaimAsStringList(GROUPS_CLAIM);
        if (groups == null) {
            return Set.of();
        }
        Set<String> authorities = new LinkedHashSet<>();
        for (String group : groups) {
            if (group != null && !group.isBlank()) {
                authorities.add(AppRole.AUTHORITY_PREFIX + group);
            }
        }
        return authorities;
    }

    private String resolvePrincipalName(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        if (email != null && !email.isBlank()) {
            return email;
        }
        String username = jwt.getClaimAsString("username");
        if (username != null && !username.isBlank()) {
            return username;
        }
        return jwt.getSubject();
    }
}
