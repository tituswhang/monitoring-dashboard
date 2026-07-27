package com.lg.microservice.msor.monitoring.common.security.provider;

import com.lg.microservice.msor.monitoring.common.security.AuthProviderProperties;
import com.lg.microservice.msor.monitoring.webservice.domain.auth.model.TokenResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class CognitoJwtProvider {

    private final AuthProviderProperties properties;
    private final RestTemplate restTemplate;

    public String getIssuer() {
        return properties.getCognito().getIssuerUri();
    }

    public JwtDecoder createJwtDecoder() {
        if ("public-key".equalsIgnoreCase(properties.getValidationMethod())) {
            return createPublicKeyDecoder();
        }
        String issuerUri = properties.getCognito().getIssuerUri();
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(issuerUri + "/.well-known/jwks.json").build();
        decoder.setJwtValidator(buildTokenValidator(issuerUri));
        return decoder;
    }

    /**
     * Builds the validator chain applied to every incoming Bearer token. The JWKS-backed
     * decoder only checks signature + issuer + expiry, so on a shared user pool a token minted
     * for another app client would otherwise be accepted. The frontend sends the Cognito
     * access token, which carries {@code token_use=access} and {@code client_id} but no
     * {@code aud} claim — so validate {@code client_id}, not the audience.
     */
    private OAuth2TokenValidator<Jwt> buildTokenValidator(String issuerUri) {
        String clientId = properties.getCognito().getClientId();
        List<OAuth2TokenValidator<Jwt>> validators = new ArrayList<>();
        validators.add(JwtValidators.createDefaultWithIssuer(issuerUri));
        validators.add(new JwtClaimValidator<String>("token_use", "access"::equals));
        validators.add(new JwtClaimValidator<String>(
                "client_id", value -> clientId != null && clientId.equals(value)));
        return new DelegatingOAuth2TokenValidator<>(validators);
    }

    private void requireOauthConfig() {
        AuthProviderProperties.CognitoProperties cognito = properties.getCognito();
        if (cognito.getDomain() == null || cognito.getDomain().isBlank()) {
            throw new IllegalStateException(
                    "COGNITO_DOMAIN is not configured (auth.provider.cognito.domain / COGNITO_DOMAIN env var)");
        }
        if (cognito.getClientId() == null || cognito.getClientId().isBlank()) {
            throw new IllegalStateException(
                    "COGNITO_CLIENT_ID is not configured (auth.provider.cognito.client-id / COGNITO_CLIENT_ID env var)");
        }
    }

    public String getLoginUrl(String state, String codeChallenge) {
        requireOauthConfig();
        AuthProviderProperties.CognitoProperties cognito = properties.getCognito();
        return String.format(
                "%s/oauth2/authorize?client_id=%s&response_type=code&scope=openid+email+profile"
                        + "&redirect_uri=%s&state=%s&code_challenge=%s&code_challenge_method=S256",
                cognito.getDomain(),
                cognito.getClientId(),
                URLEncoder.encode(cognito.getRedirectUri(), StandardCharsets.UTF_8),
                state,
                codeChallenge
        );
    }

    public String getLogoutUrl() {
        requireOauthConfig();
        AuthProviderProperties.CognitoProperties cognito = properties.getCognito();
        return String.format(
                "%s/logout?client_id=%s&logout_uri=%s",
                cognito.getDomain(),
                cognito.getClientId(),
                URLEncoder.encode(cognito.getPostLoginRedirectUri(), StandardCharsets.UTF_8)
        );
    }

    /**
     * Fetches the signed-in user's OIDC profile (sub, email, name) from Cognito's userInfo endpoint,
     * using the caller's own access token as the bearer credential. Cognito access tokens carry no
     * {@code email}/{@code name} claims, so this is the only way to put a human-readable identity on
     * something the user does (e.g. authoring a case comment).
     *
     * <p>Requires the token to have been minted with the {@code openid} scope, which the login URL
     * always requests. Returns an empty map when the lookup fails, so a profile outage degrades the
     * author to "Unknown" rather than failing the user's write.
     */
    public Map<String, Object> fetchUserInfo(String accessToken) {
        requireOauthConfig();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);

        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    properties.getCognito().getDomain() + "/oauth2/userInfo",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<Map<String, Object>>() { }
            );
            Map<String, Object> body = response.getBody();
            return body != null ? body : Map.of();
        } catch (Exception e) {
            log.warn("Failed to fetch Cognito userInfo: {}", e.getMessage());
            return Map.of();
        }
    }

    public TokenResponse exchangeCodeForTokens(String code, String codeVerifier) {
        requireOauthConfig();
        AuthProviderProperties.CognitoProperties cognito = properties.getCognito();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "authorization_code");
        body.add("client_id", cognito.getClientId());
        body.add("code", code);
        body.add("redirect_uri", cognito.getRedirectUri());
        body.add("code_verifier", codeVerifier);
        if (cognito.getClientSecret() != null && !cognito.getClientSecret().isBlank()) {
            body.add("client_secret", cognito.getClientSecret());
        }

        try {
            @SuppressWarnings("unchecked")
            ResponseEntity<Map<String, Object>> response = restTemplate.postForEntity(
                    cognito.getDomain() + "/oauth2/token",
                    new HttpEntity<>(body, headers),
                    (Class<Map<String, Object>>) (Class<?>) Map.class
            );
            return extractTokenResponse(response.getBody());
        } catch (Exception e) {
            log.error("Failed to exchange code for tokens", e);
            throw new RuntimeException("Token exchange failed", e);
        }
    }

    public TokenResponse refreshAccessToken(String refreshToken) {
        requireOauthConfig();
        AuthProviderProperties.CognitoProperties cognito = properties.getCognito();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "refresh_token");
        body.add("client_id", cognito.getClientId());
        body.add("refresh_token", refreshToken);
        if (cognito.getClientSecret() != null && !cognito.getClientSecret().isBlank()) {
            body.add("client_secret", cognito.getClientSecret());
        }

        try {
            @SuppressWarnings("unchecked")
            ResponseEntity<Map<String, Object>> response = restTemplate.postForEntity(
                    cognito.getDomain() + "/oauth2/token",
                    new HttpEntity<>(body, headers),
                    (Class<Map<String, Object>>) (Class<?>) Map.class
            );
            return extractTokenResponse(response.getBody());
        } catch (Exception e) {
            log.error("Failed to refresh access token", e);
            throw new RuntimeException("Token refresh failed", e);
        }
    }

    public void revokeToken(String token) {
        requireOauthConfig();
        AuthProviderProperties.CognitoProperties cognito = properties.getCognito();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("token", token);
        body.add("client_id", cognito.getClientId());
        if (cognito.getClientSecret() != null && !cognito.getClientSecret().isBlank()) {
            body.add("client_secret", cognito.getClientSecret());
        }

        try {
            restTemplate.postForEntity(cognito.getDomain() + "/oauth2/revoke", new HttpEntity<>(body, headers), Void.class);
        } catch (Exception e) {
            log.warn("Failed to revoke token", e);
        }
    }

    private JwtDecoder createPublicKeyDecoder() {
        String publicKey = properties.getCognito().getPublicKey();
        if (publicKey == null || publicKey.isBlank()) {
            throw new IllegalStateException(
                    "Public key validation requires auth.provider.cognito.public-key to be configured");
        }
        try {
            return NimbusJwtDecoder.withPublicKey(parsePublicKey(publicKey)).build();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to parse Cognito public key", e);
        }
    }

    private RSAPublicKey parsePublicKey(String pem) throws Exception {
        String stripped = pem
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");
        byte[] keyBytes = Base64.getDecoder().decode(stripped);
        KeyFactory kf = KeyFactory.getInstance("RSA");
        return (RSAPublicKey) kf.generatePublic(new X509EncodedKeySpec(keyBytes));
    }

    @SuppressWarnings("unchecked")
    private TokenResponse extractTokenResponse(Map<String, Object> body) {
        if (body == null) {
            throw new IllegalStateException("Empty token response from Cognito");
        }
        return new TokenResponse(
                (String) body.get("access_token"),
                (String) body.get("refresh_token"),
                body.get("expires_in") != null ? ((Number) body.get("expires_in")).longValue() : 3600L
        );
    }
}
