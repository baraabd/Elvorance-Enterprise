package com.elvorance.rep.auth;

import android.app.Activity;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.browser.customtabs.CustomTabsIntent;
import java.net.URI;

/** One system-browser authorization at a time. All entry points run on the main thread. */
final class AuthBrowserSession {
    interface Completion {
        void success(String callbackUrl);
        void failure(String code);
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Completion pending;
    private AuthRedirect policy;
    private boolean leftActivity;
    private final Runnable timeout = () -> cancel("AUTH_TIMEOUT");
    private final Runnable returned = () -> cancel("AUTH_CANCELLED");

    void start(Activity activity, URI url, AuthRedirect redirect, Completion completion) {
        if (pending != null) {
            completion.failure("AUTH_IN_PROGRESS");
            return;
        }
        pending = completion;
        policy = redirect;
        leftActivity = false;
        handler.postDelayed(timeout, 300000);
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(activity, Uri.parse(url.toString()));
        } catch (RuntimeException exception) {
            cancel("AUTH_BROWSER_UNAVAILABLE");
        }
    }

    void callback(String url) {
        if (pending == null || !policy.acceptsCallback(url)) return;
        Completion completion = clear();
        completion.success(url);
    }

    void paused() {
        if (pending != null) leftActivity = true;
    }

    void resumed() {
        // onNewIntent normally precedes onResume; delay also handles browser implementations
        // that deliver the callback immediately after resuming the host activity.
        if (pending != null && leftActivity) handler.postDelayed(returned, 300);
    }

    void cancel(String code) {
        if (pending != null) clear().failure(code);
    }

    private Completion clear() {
        Completion completion = pending;
        pending = null;
        policy = null;
        leftActivity = false;
        handler.removeCallbacks(timeout);
        handler.removeCallbacks(returned);
        return completion;
    }
}
