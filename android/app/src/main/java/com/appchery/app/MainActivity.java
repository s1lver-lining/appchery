package com.appchery.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TracePlugin.class);
        registerPlugin(WristPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
