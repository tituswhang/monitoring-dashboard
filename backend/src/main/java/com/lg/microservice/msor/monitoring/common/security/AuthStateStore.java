package com.lg.microservice.msor.monitoring.common.security;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;

/**
 * Stateless codec for the OAuth login handshake.
 *
 * <p>Earlier this held the PKCE code verifier in an in-memory map keyed by {@code state}. That
 * only works on a single instance: behind the STG/PRD HPA the {@code /login} and {@code /callback}
 * requests are load-balanced to different pods, so the callback pod never had the state and every
 * login failed with {@code invalid_state} ("Login session expired").
 *
 * <p>Instead of a shared server store, the verifier now rides back to the browser in a short-lived,
 * host-only, {@code HttpOnly}/{@code Secure}/{@code SameSite=Lax} cookie set on the {@code /login}
 * response (see {@code AuthController}). No shared state means it works across any number of pods
 * and survives restarts/scale events mid-login.
 *
 * <p>CSRF protection is preserved by the double-submit check in {@link #verifier(String, String)}:
 * the {@code state} returned in the callback URL must match the {@code state} bound inside the
 * cookie, and an attacker cannot set a cookie on our origin. PKCE independently binds the code
 * exchange to the verifier, so a stolen authorization code is useless without this cookie.
 */
@Component
public class AuthStateStore {

    private static final int VERIFIER_BYTES = 64;
    private static final char STATE_SEPARATOR = ':';

    private final SecureRandom random = new SecureRandom();

    public PkceBundle create() {
        byte[] verifierBytes = new byte[VERIFIER_BYTES];
        random.nextBytes(verifierBytes);
        String codeVerifier = Base64.getUrlEncoder().withoutPadding().encodeToString(verifierBytes);
        String codeChallenge = computeChallenge(codeVerifier);
        String state = UUID.randomUUID().toString();
        // state and verifier are both URL-safe (UUID / base64url), so the joined value stays a
        // valid cookie token after base64url encoding — Tomcat's RFC 6265 parser rejects raw
        // delimiters, as seen with the platform's `tcm` consent cookie.
        String cookieValue = Base64.getUrlEncoder().withoutPadding()
                .encodeToString((state + STATE_SEPARATOR + codeVerifier).getBytes(StandardCharsets.UTF_8));
        return new PkceBundle(state, codeChallenge, cookieValue);
    }

    /**
     * Recovers the PKCE code verifier from the login cookie, but only if the cookie's bound state
     * matches the {@code state} returned by Cognito. Returns {@code null} on any mismatch or if the
     * cookie is missing/malformed, which the caller treats as {@code invalid_state}.
     */
    public String verifier(String cookieValue, String state) {
        if (cookieValue == null || state == null) {
            return null;
        }
        String decoded;
        try {
            decoded = new String(Base64.getUrlDecoder().decode(cookieValue), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return null;
        }
        int separator = decoded.indexOf(STATE_SEPARATOR);
        if (separator < 0) {
            return null;
        }
        String cookieState = decoded.substring(0, separator);
        String codeVerifier = decoded.substring(separator + 1);
        if (!MessageDigest.isEqual(
                cookieState.getBytes(StandardCharsets.UTF_8), state.getBytes(StandardCharsets.UTF_8))) {
            return null;
        }
        return codeVerifier;
    }

    private String computeChallenge(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    public record PkceBundle(String state, String codeChallenge, String cookieValue) {}
}
