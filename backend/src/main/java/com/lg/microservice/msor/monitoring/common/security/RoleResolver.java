package com.lg.microservice.msor.monitoring.common.security;

import com.lg.microservice.msor.monitoring.model.enums.AppRole;
import com.lg.microservice.msor.monitoring.repository.AppUserRoleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Answers "what may this email do?" from {@code app_user_role} — the piece of authorization
 * that used to be a {@code cognito:groups} claim and is now ours.
 *
 * <p>This sits on the request path for every authenticated call, so it caches. The TTL is short by
 * design: a role granted or revoked from the admin UI should take effect in minutes without the user
 * signing out, which is precisely what group membership baked into a token could never do. Writes
 * (phase 2) call {@link #invalidate} to make it immediate.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RoleResolver {

    /** Short enough that a revoked role stops mattering quickly; long enough to keep the DB out of the hot path. */
    private static final Duration TTL = Duration.ofMinutes(2);

    /** Bounds the cache on a pool of unknown size; entries are tiny and evicted wholesale when exceeded. */
    private static final int MAX_ENTRIES = 500;

    private final AppUserRoleRepository appUserRoleRepository;
    private final AuthRoleProperties properties;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    /**
     * The roles held by {@code email}, never empty. An unknown or unidentifiable caller gets the
     * configured default role rather than nothing — an authenticated user with zero authorities would
     * see a wall of 403s, which reads as an outage rather than as "you have not been granted access".
     */
    public Set<AppRole> resolve(String email) {
        if (!StringUtils.hasText(email)) {
            return defaultRoles();
        }

        String key = normalize(email);
        if (isBootstrapAdmin(key)) {
            return Set.of(AppRole.ADMIN);
        }

        CacheEntry cached = cache.get(key);
        if (cached != null && cached.isFresh()) {
            return cached.roles();
        }

        Set<AppRole> granted = lookup(key);
        if (granted == null) {
            // The database is unreachable. Degrade to the default role for this request rather than
            // failing it, and do not cache — the next request should try again, not inherit a guess.
            return defaultRoles();
        }
        put(key, granted);
        return granted;
    }

    /** Drops a user's cached roles so a grant or revoke takes effect on their next request. */
    public void invalidate(String email) {
        if (StringUtils.hasText(email)) {
            cache.remove(normalize(email));
        }
    }

    public void invalidateAll() {
        cache.clear();
    }

    /** The user's granted roles, the default role if they have none, or null if the lookup failed. */
    private Set<AppRole> lookup(String email) {
        List<String> roleNames;
        try {
            roleNames = appUserRoleRepository.findRoleNamesByEmail(email);
        } catch (DataAccessException e) {
            log.error("Could not read roles for '{}'; falling back to the default role", email, e);
            return null;
        }

        Set<AppRole> granted = roleNames.stream()
                .map(AppRole::parse)
                .flatMap(Optional::stream)
                .collect(Collectors.toUnmodifiableSet());

        return granted.isEmpty() ? defaultRoles() : granted;
    }

    private boolean isBootstrapAdmin(String email) {
        return properties.getBootstrapAdmins().stream()
                .filter(StringUtils::hasText)
                .map(RoleResolver::normalize)
                .anyMatch(email::equals);
    }

    private Set<AppRole> defaultRoles() {
        AppRole fallback = properties.getDefaultRole();
        return Set.of(fallback == null ? AppRole.VIEWER : fallback);
    }

    private void put(String email, Set<AppRole> roles) {
        if (cache.size() >= MAX_ENTRIES) {
            cache.clear();
        }
        cache.put(email, new CacheEntry(roles, Instant.now().plus(TTL)));
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private record CacheEntry(Set<AppRole> roles, Instant expiresAt) {
        boolean isFresh() {
            return Instant.now().isBefore(expiresAt);
        }
    }
}
