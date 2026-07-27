package com.lg.microservice.msor.monitoring.webservice.domain.auth.controller;

import com.lg.microservice.msor.monitoring.common.security.AuthProviderProperties;
import com.lg.microservice.msor.monitoring.common.security.AuthRoleProperties;
import com.lg.microservice.msor.monitoring.common.security.AuthStateStore;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUserResolver;
import com.lg.microservice.msor.monitoring.common.security.provider.CognitoJwtProvider;
import com.lg.microservice.msor.monitoring.model.enums.AppPermission;
import com.lg.microservice.msor.monitoring.model.enums.AppRole;
import com.lg.microservice.msor.monitoring.model.response.CurrentUserResponse;
import com.lg.microservice.msor.monitoring.webservice.domain.auth.model.TokenResponse;
import com.lg.microservice.msor.monitoring.webservice.domain.auth.service.UserAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.Arrays;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String REFRESH_TOKEN_COOKIE = "refresh_token";
    private static final int COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
    private static final String OAUTH_STATE_COOKIE = "oauth_state";
    private static final int OAUTH_STATE_MAX_AGE = 600; // 10 minutes, matches the login window

    private final CognitoJwtProvider cognitoJwtProvider;
    private final AuthStateStore authStateStore;
    private final AuthProviderProperties properties;
    private final AuthRoleProperties roleProperties;
    private final AuthenticatedUserResolver authenticatedUserResolver;
    private final UserAdminService userAdminService;

    @Value("${auth.enabled:true}")
    private boolean authEnabled;

    @Operation(summary = "The caller's identity, roles, and permissions",
            description = "Derived from the authorities the security filter chain enforces, so the UI and the "
                    + "server cannot disagree about what the caller is allowed to do.")
    @ApiResponse(responseCode = "200", description = "Success")
    @ApiResponse(responseCode = "401", description = "Not signed in")
    @GetMapping("/me")
    public ResponseEntity<CurrentUserResponse> me(Authentication authentication) {
        if (!authEnabled) {
            AppRole demoRole = Optional.ofNullable(roleProperties.getDemoRole()).orElse(AppRole.ADMIN);
            return ResponseEntity.ok(currentUser(new AuthenticatedUser("Demo User", null), Set.of(demoRole)));
        }
        if (authentication == null || !(authentication.getPrincipal() instanceof Jwt jwt)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        AuthenticatedUser user = authenticatedUserResolver.resolve(authentication);

        // The first call after a self-signup is how an invited person's waiting roles meet their
        // account. Recording it is what lets the admin table say "invited, not yet arrived".
        // Attribution is not worth failing a page load over, so a failure here is logged, not thrown.
        try {
            userAdminService.recordSignIn(user, jwt.getSubject());
        } catch (RuntimeException e) {
            log.warn("Could not record sign-in for '{}'", user.email(), e);
        }

        return ResponseEntity.ok(currentUser(user, rolesOf(authentication)));
    }

    /**
     * Reads the roles back off the granted authorities rather than re-resolving them. That is the
     * point: whatever the filter chain will actually enforce for this request is exactly what the UI
     * is told. A legacy Cognito group whose name is not an app role (anything but {@code admin}) has
     * no bearing on what the UI can show, so it is dropped.
     */
    private static Set<AppRole> rolesOf(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority.startsWith(AppRole.AUTHORITY_PREFIX))
                .map(authority -> authority.substring(AppRole.AUTHORITY_PREFIX.length()))
                .map(AppRole::parse)
                .flatMap(Optional::stream)
                .collect(() -> EnumSet.noneOf(AppRole.class), Set::add, Set::addAll);
    }

    private static CurrentUserResponse currentUser(AuthenticatedUser user, Set<AppRole> roles) {
        Set<AppPermission> permissions = EnumSet.noneOf(AppPermission.class);
        roles.forEach(role -> permissions.addAll(role.permissions()));
        return new CurrentUserResponse(user.name(), user.email(), names(roles), names(permissions));
    }

    private static <E extends Enum<E>> List<String> names(Set<E> values) {
        return values.stream()
                .sorted(Comparator.comparing(Enum::name))
                .map(Enum::name)
                .toList();
    }

    @GetMapping("/login")
    public ResponseEntity<Map<String, String>> login(HttpServletResponse response) {
        try {
            AuthStateStore.PkceBundle pkce = authStateStore.create();
            String loginUrl = cognitoJwtProvider.getLoginUrl(pkce.state(), pkce.codeChallenge());
            setStateCookie(response, pkce.cookieValue());
            return ResponseEntity.ok(Map.of("loginUrl", loginUrl));
        } catch (IllegalStateException e) {
            log.error("Cognito is not configured: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/callback")
    public void callback(@RequestParam String code, @RequestParam String state,
                         HttpServletRequest request, HttpServletResponse response) throws IOException {
        String codeVerifier = authStateStore.verifier(extractCookie(request, OAUTH_STATE_COOKIE), state);
        clearStateCookie(response);
        if (codeVerifier == null) {
            log.warn("Invalid or expired OAuth state on callback");
            response.sendRedirect(properties.getCognito().getPostLoginRedirectUri() + "?error=invalid_state");
            return;
        }

        try {
            TokenResponse tokens = cognitoJwtProvider.exchangeCodeForTokens(code, codeVerifier);
            setRefreshTokenCookie(response, tokens.refreshToken());
            response.sendRedirect(properties.getCognito().getPostLoginRedirectUri());
        } catch (Exception e) {
            log.error("OAuth callback failed", e);
            response.sendRedirect(properties.getCognito().getPostLoginRedirectUri() + "?error=auth_failed");
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, Object>> refresh(HttpServletRequest request, HttpServletResponse response) {
        if (!authEnabled) {
            return ResponseEntity.ok(Map.of("accessToken", "dev-bypass", "expiresIn", 3600L));
        }

        String refreshToken = extractCookie(request, REFRESH_TOKEN_COOKIE);
        if (refreshToken == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            TokenResponse tokens = cognitoJwtProvider.refreshAccessToken(refreshToken);
            if (tokens.refreshToken() != null) {
                setRefreshTokenCookie(response, tokens.refreshToken());
            }
            return ResponseEntity.ok(Map.of(
                    "accessToken", tokens.accessToken(),
                    "expiresIn", tokens.expiresIn()
            ));
        } catch (Exception e) {
            log.warn("Token refresh failed", e);
            clearRefreshTokenCookie(response);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(HttpServletRequest request, HttpServletResponse response) {
        String refreshToken = extractCookie(request, REFRESH_TOKEN_COOKIE);
        if (refreshToken != null) {
            cognitoJwtProvider.revokeToken(refreshToken);
        }
        clearRefreshTokenCookie(response);
        return ResponseEntity.ok(Map.of("logoutUrl", cognitoJwtProvider.getLogoutUrl()));
    }

    // SameSite=Lax is required so the cookie is still sent on the top-level GET redirect back from
    // Cognito's domain to /callback (Strict would suppress it). Host-only (no Domain attribute) keeps
    // it off sibling hosts on the same parent domain.
    private void setStateCookie(HttpServletResponse response, String value) {
        ResponseCookie cookie = ResponseCookie.from(OAUTH_STATE_COOKIE, value)
                .httpOnly(true)
                .secure(true)
                .path("/")
                .maxAge(OAUTH_STATE_MAX_AGE)
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private void clearStateCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(OAUTH_STATE_COOKIE, "")
                .httpOnly(true)
                .secure(true)
                .path("/")
                .maxAge(0)
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private void setRefreshTokenCookie(HttpServletResponse response, String value) {
        Cookie cookie = new Cookie(REFRESH_TOKEN_COOKIE, value);
        cookie.setHttpOnly(true);
        cookie.setSecure(true);
        cookie.setPath("/");
        cookie.setMaxAge(COOKIE_MAX_AGE);
        response.addCookie(cookie);
    }

    private void clearRefreshTokenCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie(REFRESH_TOKEN_COOKIE, "");
        cookie.setHttpOnly(true);
        cookie.setSecure(true);
        cookie.setPath("/");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
    }

    private String extractCookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        return Arrays.stream(cookies)
                .filter(c -> name.equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }
}
