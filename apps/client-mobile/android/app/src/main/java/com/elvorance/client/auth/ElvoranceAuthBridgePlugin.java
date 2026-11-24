package com.elvorance.client.auth;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URI;
import org.json.JSONObject;

@CapacitorPlugin(name = "ElvoranceAuthBridge")
public final class ElvoranceAuthBridgePlugin extends Plugin {
    private AuthSecureStore store;
    private final AuthBrowserSession browser = new AuthBrowserSession();

    @Override public void load() { store = new AuthSecureStore(getContext()); }

    @PluginMethod public void get(PluginCall call) {
        try {
            String value = store.get(call.getString("key"));
            call.resolve(new JSObject().put("value", value == null ? JSONObject.NULL : value));
        } catch (Exception exception) { call.reject("Secure storage is unavailable", "AUTH_STORAGE_ERROR"); }
    }

    @PluginMethod public void set(PluginCall call) {
        try {
            store.set(call.getString("key"), call.getString("value"));
            call.resolve();
        } catch (Exception exception) { call.reject("Secure storage write failed", "AUTH_STORAGE_ERROR"); }
    }

    @PluginMethod public void remove(PluginCall call) {
        try {
            store.remove(call.getString("key"));
            call.resolve();
        } catch (Exception exception) { call.reject("Secure storage removal failed", "AUTH_STORAGE_ERROR"); }
    }

    @PluginMethod public void authorize(PluginCall call) {
        final AuthRedirect policy;
        final URI url;
        try {
            policy = new AuthRedirect(getAppId(), getConfig().getString("authorizationEndpoint"));
            url = policy.authorization(call.getString("url"), call.getString("redirectUri"));
        } catch (Exception exception) {
            call.reject("Authorization configuration is invalid", "AUTH_CONFIGURATION_ERROR");
            return;
        }
        getActivity().runOnUiThread(() -> browser.start(getActivity(), url, policy, new AuthBrowserSession.Completion() {
            @Override public void success(String callbackUrl) { call.resolve(new JSObject().put("callbackUrl", callbackUrl)); }
            @Override public void failure(String code) { call.reject("Authorization did not complete", code); }
        }));
    }

    @PluginMethod public void cancelAuthorization(PluginCall call) {
        getActivity().runOnUiThread(() -> { browser.cancel("AUTH_CANCELLED"); call.resolve(); });
    }

    @Override protected void handleOnNewIntent(Intent intent) {
        if (intent.getData() != null) browser.callback(intent.getData().toString());
    }
    @Override protected void handleOnPause() { browser.paused(); }
    @Override protected void handleOnResume() { browser.resumed(); }
    @Override protected void handleOnDestroy() { browser.cancel("AUTH_CANCELLED"); }
}
