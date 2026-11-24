package com.elvorance.client;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.elvorance.client.auth.ElvoranceAuthBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ElvoranceAuthBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
