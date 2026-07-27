package com.lg.microservice.msor.monitoring.webservice.domain.auth.service.impl;

import com.lg.microservice.msor.monitoring.common.security.AuthProviderProperties;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.webservice.domain.auth.service.CognitoUserAdminService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminGetUserResponse;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.UserNotFoundException;

import java.util.List;
import java.util.Optional;

/**
 * The only remaining caller of the Cognito admin SDK, used by the activity-timeline author backfill.
 * It is therefore the only thing in this service that needs {@code COGNITO_USER_POOL_ID} and real
 * AWS credentials — inviting a user needs neither.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CognitoUserAdminServiceImpl implements CognitoUserAdminService {

    private final CognitoIdentityProviderClient cognitoClient;
    private final AuthProviderProperties properties;

    @Override
    public Optional<AuthenticatedUser> findBySubject(String subject) {
        String userPoolId = requireUserPoolId();
        try {
            AdminGetUserResponse user = cognitoClient.adminGetUser(b -> b
                    .userPoolId(userPoolId).username(subject));
            String email = attribute(user.userAttributes(), "email");
            String name = attribute(user.userAttributes(), "name");
            return email == null && name == null
                    ? Optional.empty()
                    : Optional.of(new AuthenticatedUser(name, email));
        } catch (UserNotFoundException e) {
            log.info("Cognito user '{}' no longer exists", subject);
            return Optional.empty();
        }
    }

    private static String attribute(List<AttributeType> attributes, String name) {
        return attributes.stream()
                .filter(a -> name.equals(a.name()))
                .map(AttributeType::value)
                .filter(v -> v != null && !v.isBlank())
                .findFirst()
                .orElse(null);
    }

    private String requireUserPoolId() {
        String userPoolId = properties.getCognito().getUserPoolId();
        if (userPoolId == null || userPoolId.isBlank()) {
            throw new IllegalStateException(
                    "COGNITO_USER_POOL_ID is not configured "
                            + "(auth.provider.cognito.user-pool-id / COGNITO_USER_POOL_ID env var)");
        }
        return userPoolId;
    }
}
