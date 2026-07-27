package com.lg.microservice.msor.monitoring.common.security;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Getter
@Setter
@Configuration
@ConfigurationProperties(prefix = "auth.provider")
public class AuthProviderProperties {

    private String validationMethod = "jwk";

    /**
     * Cognito group name that grants administrative privileges (e.g. inviting new users).
     * Mapped to the Spring Security authority {@code ROLE_<adminGroup>}.
     */
    private String adminGroup = "admin";

    private CognitoProperties cognito = new CognitoProperties();

    @Getter
    @Setter
    public static class CognitoProperties {
        private String issuerUri;
        private String userPoolId;
        private String publicKey;
        private String clientId;
        private String clientSecret;
        private String domain;
        private String redirectUri;
        private String postLoginRedirectUri;
    }
}
