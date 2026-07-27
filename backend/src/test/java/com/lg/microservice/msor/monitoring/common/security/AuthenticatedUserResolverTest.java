package com.lg.microservice.msor.monitoring.common.security;

import com.lg.microservice.msor.monitoring.common.security.provider.CognitoJwtProvider;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest(classes = AuthenticatedUserResolverTest.class)
class AuthenticatedUserResolverTest {

    /** Cognito mints usernames identical to the subject on pools that sign in by email alias. */
    private static final String SUBJECT = "2458e4a8-6071-70c5-2cec-d27265644244";

    @Mock
    private CognitoJwtProvider cognitoJwtProvider;

    @InjectMocks
    private AuthenticatedUserResolver resolver;

    @Test
    void resolve_unauthenticated_returnsAnonymous() {
        Assertions.assertEquals(AuthenticatedUser.anonymous(), resolver.resolve(null));
        verify(cognitoJwtProvider, never()).fetchUserInfo(any());
    }

    @Test
    void resolve_tokenCarriesProfileClaims_skipsUserInfoLookup() {
        Authentication authentication = authenticationFor(jwtBuilder()
                .claim("name", "Demo User")
                .claim("email", "demo.user@example.com")
                .build());

        AuthenticatedUser user = resolver.resolve(authentication);

        Assertions.assertEquals("Demo User", user.name());
        Assertions.assertEquals("demo.user@example.com", user.email());
        verify(cognitoJwtProvider, never()).fetchUserInfo(any());
    }

    @Test
    void resolve_accessToken_resolvesProfileFromUserInfo() {
        doReturn(Map.of("sub", SUBJECT, "name", "Demo User", "email", "demo.user@example.com"))
                .when(cognitoJwtProvider).fetchUserInfo("token-value");

        AuthenticatedUser user = resolver.resolve(authenticationFor(accessToken()));

        Assertions.assertEquals("Demo User", user.name());
        Assertions.assertEquals("demo.user@example.com", user.email());
    }

    @Test
    void resolve_repeatedCalls_fetchesUserInfoOnce() {
        doReturn(Map.of("email", "demo.user@example.com")).when(cognitoJwtProvider).fetchUserInfo("token-value");

        resolver.resolve(authenticationFor(accessToken()));
        resolver.resolve(authenticationFor(accessToken()));

        verify(cognitoJwtProvider, times(1)).fetchUserInfo("token-value");
    }

    @Test
    void resolve_userInfoUnavailable_neverAttributesToSubjectUuid() {
        doReturn(Map.of()).when(cognitoJwtProvider).fetchUserInfo("token-value");

        AuthenticatedUser user = resolver.resolve(authenticationFor(accessToken()));

        Assertions.assertEquals(AuthenticatedUser.anonymous(), user);
    }

    @Test
    void resolve_userInfoUnavailableWithRealUsername_fallsBackToUsername() {
        Jwt jwt = jwtBuilder().claim("username", "demo.user").build();
        doReturn(Map.of()).when(cognitoJwtProvider).fetchUserInfo("token-value");

        AuthenticatedUser user = resolver.resolve(authenticationFor(jwt));

        Assertions.assertEquals("demo.user", user.name());
        Assertions.assertNull(user.email());
    }

    private static Jwt accessToken() {
        return jwtBuilder().claim("username", SUBJECT).claim("token_use", "access").build();
    }

    private static Jwt.Builder jwtBuilder() {
        return Jwt.withTokenValue("token-value").header("alg", "RS256").subject(SUBJECT);
    }

    private static Authentication authenticationFor(Jwt jwt) {
        return new JwtAuthenticationToken(jwt);
    }
}
