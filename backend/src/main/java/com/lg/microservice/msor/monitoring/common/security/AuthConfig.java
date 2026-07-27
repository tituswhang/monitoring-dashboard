package com.lg.microservice.msor.monitoring.common.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.common.security.provider.CognitoJwtProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Component;

import java.util.Base64;
import java.util.Map;

@Slf4j
@Component
public class AuthConfig {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, JwtDecoder> issuerDecoderMap;

    public AuthConfig(CognitoJwtProvider cognitoJwtProvider) {
        String issuer = cognitoJwtProvider.getIssuer();
        JwtDecoder decoder = cognitoJwtProvider.createJwtDecoder();
        this.issuerDecoderMap = Map.of(issuer, decoder);
        log.info("Registered Cognito JWT decoder for issuer: {}", issuer);
    }

    public JwtDecoder getDecoder(String issuer) {
        return issuerDecoderMap.get(issuer);
    }

    public String peekIssuer(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length < 2) {
                return null;
            }
            byte[] payload = Base64.getUrlDecoder().decode(parts[1]);
            JsonNode json = objectMapper.readTree(payload);
            JsonNode issNode = json.get("iss");
            return issNode != null ? issNode.asText() : null;
        } catch (Exception e) {
            log.debug("Failed to peek issuer from token", e);
            return null;
        }
    }
}
