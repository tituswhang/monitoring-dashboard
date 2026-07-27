package com.lg.microservice.msor.monitoring.common.security;

import com.lg.microservice.msor.monitoring.common.security.provider.CognitoJwtProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Resolves the display identity ("Ada Lovelace" / "ada.lovelace@example.com") of the user behind
 * a request, for attribution on anything they author.
 *
 * <p>The frontend authenticates with a Cognito <em>access</em> token, which carries only opaque
 * identifiers: {@code sub}, and — on a pool that signs in by email alias — a {@code username} that is
 * the same UUID. Neither is meaningful to a human reading a comment thread. The profile attributes
 * live behind Cognito's userInfo endpoint, so we fetch them once per user and cache them; the token
 * is long-lived relative to how often a name or email changes.
 *
 * <p>A failed lookup yields {@link AuthenticatedUser#anonymous()} rather than an exception: attribution
 * is not worth failing a user's write over. Failures are cached briefly so a Cognito outage doesn't turn
 * every comment into a retry.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AuthenticatedUserResolver {

    private static final Duration HIT_TTL = Duration.ofMinutes(30);
    private static final Duration MISS_TTL = Duration.ofMinutes(1);

    /** Bounds the cache on a pool of unknown size; entries are tiny and evicted wholesale when exceeded. */
    private static final int MAX_ENTRIES = 500;

    private final CognitoJwtProvider cognitoJwtProvider;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public AuthenticatedUser resolve(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Jwt jwt)) {
            return AuthenticatedUser.anonymous();
        }
        return resolveFromToken(jwt);
    }

    /**
     * Resolves straight from a token, for callers that have one before an {@link Authentication}
     * exists — {@link AppJwtConverter} needs the email to look up roles while it is still building
     * the very authentication that would carry them. Deliberately not an overload of
     * {@link #resolve}: {@code resolve(null)} would become ambiguous.
     */
    public AuthenticatedUser resolveFromToken(Jwt jwt) {
        if (jwt == null) {
            return AuthenticatedUser.anonymous();
        }

        // An ID token, or an access token enriched by a pre-token-generation trigger, already has what
        // we need — skip the round trip.
        AuthenticatedUser fromToken = toUser(jwt.getClaimAsString("name"), jwt.getClaimAsString("email"));
        if (fromToken != null) {
            return fromToken;
        }

        String subject = jwt.getSubject();
        if (!StringUtils.hasText(subject)) {
            return AuthenticatedUser.anonymous();
        }

        CacheEntry cached = cache.get(subject);
        if (cached != null && cached.isFresh()) {
            return cached.user();
        }

        AuthenticatedUser resolved = fetch(jwt);
        put(subject, resolved);
        return resolved;
    }

    private AuthenticatedUser fetch(Jwt jwt) {
        Map<String, Object> userInfo = cognitoJwtProvider.fetchUserInfo(jwt.getTokenValue());
        AuthenticatedUser user = toUser(asString(userInfo.get("name")), asString(userInfo.get("email")));
        if (user != null) {
            return user;
        }

        // Pools that sign in by username (rather than by email alias) put a real handle in this claim.
        String username = jwt.getClaimAsString("username");
        if (StringUtils.hasText(username) && !username.equals(jwt.getSubject())) {
            return toUser(username, null);
        }

        log.warn("Could not resolve a display identity for subject '{}'; attributing to Unknown", jwt.getSubject());
        return AuthenticatedUser.anonymous();
    }

    /**
     * Builds a user from a candidate name/email pair, or null when neither is usable. An email is only
     * trusted if it looks like one — this is what keeps a subject UUID out of the identity column when
     * the caller passes {@code authentication.getName()} as an email fallback.
     */
    private static AuthenticatedUser toUser(String name, String email) {
        String cleanName = StringUtils.hasText(name) ? name.trim() : null;
        String cleanEmail = StringUtils.hasText(email) && email.contains("@") ? email.trim() : null;
        return cleanName == null && cleanEmail == null ? null : new AuthenticatedUser(cleanName, cleanEmail);
    }

    private static String asString(Object value) {
        return value instanceof String s ? s : null;
    }

    private void put(String subject, AuthenticatedUser user) {
        if (cache.size() >= MAX_ENTRIES) {
            cache.clear();
        }
        Duration ttl = user.equals(AuthenticatedUser.anonymous()) ? MISS_TTL : HIT_TTL;
        cache.put(subject, new CacheEntry(user, Instant.now().plus(ttl)));
    }

    private record CacheEntry(AuthenticatedUser user, Instant expiresAt) {
        boolean isFresh() {
            return Instant.now().isBefore(expiresAt);
        }
    }
}
