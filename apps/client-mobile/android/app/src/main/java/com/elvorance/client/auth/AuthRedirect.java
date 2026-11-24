package com.elvorance.client.auth;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/** URL policy shared by the native browser boundary and its JVM tests. */
public final class AuthRedirect {
    private final String expectedRedirect;
    private final URI authorizationEndpoint;

    public AuthRedirect(String applicationId, String endpoint) {
        if (!applicationId.matches("com\\.elvorance\\.client(\\.staging)?")) {
            throw new IllegalArgumentException("Unrecognized application identity");
        }
        expectedRedirect = applicationId + ":/oauth2redirect";
        authorizationEndpoint = URI.create(Objects.requireNonNull(endpoint, "Missing authorization endpoint"));
        if (!isHttps(authorizationEndpoint) || authorizationEndpoint.getRawQuery() != null) {
            throw new IllegalArgumentException("Invalid authorization endpoint");
        }
    }

    public URI authorization(String url, String redirectUri) {
        if (!expectedRedirect.equals(redirectUri)) throw new IllegalArgumentException("Invalid redirect URI");
        URI candidate = URI.create(Objects.requireNonNull(url, "Missing authorization URL"));
        if (!isHttps(candidate)
            || !authorizationEndpoint.getHost().equalsIgnoreCase(candidate.getHost())
            || authorizationEndpoint.getPort() != candidate.getPort()
            || !Objects.equals(authorizationEndpoint.getRawPath(), candidate.getRawPath())) {
            throw new IllegalArgumentException("Untrusted authorization endpoint");
        }
        Map<String, String> params = query(candidate.getRawQuery());
        if (!expectedRedirect.equals(params.get("redirect_uri"))
            || !"code".equals(params.get("response_type"))
            || !"S256".equals(params.get("code_challenge_method"))
            || !params.getOrDefault("code_challenge", "").matches("[A-Za-z0-9_-]{43,128}")) {
            throw new IllegalArgumentException("Authorization must use the registered redirect and PKCE S256");
        }
        return candidate;
    }

    public boolean acceptsCallback(String url) {
        try {
            URI candidate = URI.create(url);
            return candidate.getRawQuery() != null
                && candidate.getRawFragment() == null
                && expectedRedirect.equals(url.substring(0, url.indexOf('?')))
                && candidate.getRawAuthority() == null;
        } catch (IllegalArgumentException | NullPointerException exception) {
            return false;
        }
    }

    private static boolean isHttps(URI url) {
        return "https".equals(url.getScheme()) && url.getHost() != null
            && url.getRawUserInfo() == null && url.getRawFragment() == null;
    }

    private static String decode(String value) {
        try { return URLDecoder.decode(value, StandardCharsets.UTF_8.name()); }
        catch (UnsupportedEncodingException impossible) { throw new IllegalStateException(impossible); }
    }

    private static Map<String, String> query(String query) {
        Map<String, String> result = new HashMap<>();
        if (query == null) return result;
        for (String part : query.split("&")) {
            String[] pair = part.split("=", 2);
            String key = decode(pair[0]);
            String value = pair.length == 2 ? decode(pair[1]) : "";
            if (result.putIfAbsent(key, value) != null) throw new IllegalArgumentException("Duplicate authorization parameter");
        }
        return result;
    }
}
