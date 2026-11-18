package com.elvorance.rep.auth;

import static org.junit.Assert.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class AuthRedirectTest {
    private final String endpoint = "https://identity.example.test/realms/elvorance-staging/protocol/openid-connect/auth";
    private final String redirect = "com.elvorance.rep.staging:/oauth2redirect";
    private final AuthRedirect policy = new AuthRedirect("com.elvorance.rep.staging", endpoint);

    private String request(String redirect) {
        return endpoint + "?response_type=code&client_id=rep&redirect_uri="
            + URLEncoder.encode(redirect, StandardCharsets.UTF_8)
            + "&code_challenge_method=S256&code_challenge=" + "A".repeat(43);
    }

    @Test public void acceptsOnlyPinnedAuthorizationWithPkce() {
        assertEquals(endpoint, policy.authorization(request(redirect), redirect).toString().split("\\?")[0]);
        for (String unsafe : new String[] {
            request(redirect).replace("https:", "http:"),
            request(redirect).replace("identity.example.test", "attacker.example.test"),
            request(redirect).replace("/auth?", "/token?"),
            request(redirect).replace("S256", "plain"),
            request("com.elvorance.rep:/oauth2redirect"),
            request(redirect) + "&redirect_uri=" + redirect,
            request(redirect) + "#fragment"
        }) assertThrows(IllegalArgumentException.class, () -> policy.authorization(unsafe, redirect));
    }

    @Test public void rejectsCrossEnvironmentAndForgedCallbackShapes() {
        assertTrue(policy.acceptsCallback(redirect + "?code=code&state=state"));
        for (String unsafe : new String[] {
            "com.elvorance.rep:/oauth2redirect?code=x",
            "com.elvorance.rep.staging://attacker/oauth2redirect?code=x",
            "com.elvorance.rep.staging:/other?code=x",
            "com.elvorance.rep.staging:/%6fauth2redirect?code=x",
            redirect + "?code=x#fragment", redirect, "https://identity.example.test/?code=x"
        }) assertFalse(unsafe, policy.acceptsCallback(unsafe));
    }
}
