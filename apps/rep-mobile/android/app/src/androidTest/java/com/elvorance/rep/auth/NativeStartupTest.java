package com.elvorance.rep.auth;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.elvorance.rep.MainActivity;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeStartupTest {
    @Test public void stagingActivityRegistersSecureBridgeAndCreatesWebView() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                assertEquals("com.elvorance.rep.staging", activity.getPackageName());
                assertNotNull(activity.getBridge().getPlugin("ElvoranceAuthBridge"));
                assertNotNull(activity.getBridge().getWebView());
            });
        }
    }
}
