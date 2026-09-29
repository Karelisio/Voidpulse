package com.karelisio.voidpulse;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propres à l'application : à enregistrer avant l'initialisation du pont.
        registerPlugin(VoidpulseNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
