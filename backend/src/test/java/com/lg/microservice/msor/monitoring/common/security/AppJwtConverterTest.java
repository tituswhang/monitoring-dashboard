package com.lg.microservice.msor.monitoring.common.security;

import com.lg.microservice.msor.monitoring.model.enums.AppRole;
import com.lg.microservice.msor.monitoring.repository.AppUserRoleRepository;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class AppJwtConverterTest {

    private static final String SUBJECT = "2458e4a8-6071-70c5-2cec-d27265644244";
    private static final String EMAIL = "demo.user@example.com";

    @Mock
    private AuthenticatedUserResolver authenticatedUserResolver;

    @Mock
    private AppUserRoleRepository appUserRoleRepository;

    private AuthRoleProperties roleProperties;
    private AppJwtConverter converter;

    @BeforeEach
    void setUp() {
        roleProperties = new AuthRoleProperties();
        converter = new AppJwtConverter(
                authenticatedUserResolver,
                new RoleResolver(appUserRoleRepository, roleProperties),
                roleProperties);
        lenient().doReturn(new AuthenticatedUser("Demo User", EMAIL))
                .when(authenticatedUserResolver).resolveFromToken(any(Jwt.class));
    }

    /** The whole point: a token carrying no groups at all still yields real authorities. */
    @Test
    void convert_tokenWithoutGroups_stillGetsRolesFromTheDatabase() {
        roleProperties.setSource(RoleSource.DB);
        doReturn(List.of("EDITOR")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);

        Assertions.assertEquals(Set.of("ROLE_EDITOR"), authorities(jwt().build()));
    }

    @Test
    void convert_sourceDb_ignoresLegacyCognitoGroups() {
        roleProperties.setSource(RoleSource.DB);
        doReturn(List.of("VIEWER")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);

        Jwt token = jwt().claim("cognito:groups", List.of("admin")).build();

        Assertions.assertEquals(Set.of("ROLE_VIEWER"), authorities(token));
    }

    /**
     * Phase 1's safety property: an admin defined either way keeps admin access, so the tables can
     * ship before anyone has a row in them.
     */
    @Test
    void convert_sourceBoth_unionsDatabaseRolesWithCognitoGroups() {
        roleProperties.setSource(RoleSource.BOTH);
        doReturn(List.of("EDITOR")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);

        Jwt token = jwt().claim("cognito:groups", List.of("admin")).build();

        Assertions.assertEquals(Set.of("ROLE_EDITOR", "ROLE_admin"), authorities(token));
    }

    @Test
    void convert_unidentifiableCaller_getsTheDefaultRole() {
        roleProperties.setSource(RoleSource.DB);
        doReturn(AuthenticatedUser.anonymous()).when(authenticatedUserResolver).resolveFromToken(any(Jwt.class));

        Assertions.assertEquals(Set.of(AppRole.VIEWER.authority()), authorities(jwt().build()));
    }

    @Test
    void convert_principalName_prefersEmailOverTheSubjectUuid() {
        roleProperties.setSource(RoleSource.DB);
        doReturn(List.of("VIEWER")).when(appUserRoleRepository).findRoleNamesByEmail(EMAIL);

        AbstractAuthenticationToken token = converter.convert(jwt().claim("email", EMAIL).build());

        Assertions.assertEquals(EMAIL, token.getName());
    }

    private Set<String> authorities(Jwt jwt) {
        return converter.convert(jwt).getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toSet());
    }

    private static Jwt.Builder jwt() {
        return Jwt.withTokenValue("token-value").header("alg", "RS256").subject(SUBJECT);
    }
}
