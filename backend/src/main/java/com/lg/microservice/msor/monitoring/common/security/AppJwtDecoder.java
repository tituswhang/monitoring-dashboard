package com.lg.microservice.msor.monitoring.common.security;

import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AppJwtDecoder implements JwtDecoder {

    private final AuthConfig authConfig;

    @Override
    public Jwt decode(String token) throws JwtException {
        String issuer = authConfig.peekIssuer(token);
        JwtDecoder decoder = issuer != null ? authConfig.getDecoder(issuer) : null;

        if (decoder == null) {
            throw new JwtException("Unknown issuer: " + issuer);
        }

        return decoder.decode(token);
    }
}
