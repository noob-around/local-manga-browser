package com.localmanga.reader;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalMangaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
