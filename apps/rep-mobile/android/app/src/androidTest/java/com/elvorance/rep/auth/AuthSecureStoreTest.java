package com.elvorance.rep.auth;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.GeneralSecurityException;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AuthSecureStoreTest {
    private Context context;
    private AuthSecureStore store;

    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.elvorance.rep.staging", context.getPackageName());
        store = new AuthSecureStore(context);
        store.remove("auth-transaction");
        store.remove("auth-session");
    }

    @After public void cleanup() throws Exception {
        store.remove("auth-transaction");
        store.remove("auth-session");
    }

    @Test public void roundTripSurvivesNewInstanceAndNeverWritesPlaintext() throws Exception {
        String token = "synthetic-test-token-never-a-live-credential";
        store.set("auth-session", token);
        assertEquals(token, new AuthSecureStore(context).get("auth-session"));
        File record = new File(context.getNoBackupFilesDir(), "elvorance-auth/auth-session.enc");
        assertFalse(new String(read(record), StandardCharsets.UTF_8).contains(token));
        store.remove("auth-session");
        assertNull(new AuthSecureStore(context).get("auth-session"));
    }

    @Test public void tamperingAndCrossKeyCopyFailClosed() throws Exception {
        store.set("auth-session", "synthetic-session");
        File record = new File(context.getNoBackupFilesDir(), "elvorance-auth/auth-session.enc");
        File transaction = new File(context.getNoBackupFilesDir(), "elvorance-auth/auth-transaction.enc");
        byte[] ciphertext = read(record);
        write(transaction, ciphertext);
        assertThrows(GeneralSecurityException.class, () -> store.get("auth-transaction"));
        ciphertext[ciphertext.length - 1] ^= 1;
        write(record, ciphertext);
        assertThrows(GeneralSecurityException.class, () -> store.get("auth-session"));
    }

    private static byte[] read(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    private static void write(File file, byte[] bytes) throws Exception {
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); output.getFD().sync(); }
    }

    @Test public void rejectsUnknownKeysAndOversizeValues() {
        assertThrows(IllegalArgumentException.class, () -> store.get("../session"));
        assertThrows(IllegalArgumentException.class, () -> store.set("auth-session", new String(new char[131073]).replace('\0', 'x')));
    }
}
