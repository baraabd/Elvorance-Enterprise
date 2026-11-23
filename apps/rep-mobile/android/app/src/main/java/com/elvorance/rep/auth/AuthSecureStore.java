package com.elvorance.rep.auth;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** App-private ciphertext only; the AES key never leaves Android Keystore. */
public final class AuthSecureStore {
    private static final int MAX_BYTES = 131072;
    private static final int NONCE_BYTES = 12;
    private final File directory;
    private final String namespace;

    public AuthSecureStore(Context context) {
        directory = new File(context.getNoBackupFilesDir(), "elvorance-auth");
        namespace = context.getPackageName() + ".auth.v1";
    }

    public synchronized String get(String key) throws IOException, GeneralSecurityException {
        AtomicFile record = record(key);
        if (!record.getBaseFile().exists()) return null;
        byte[] encrypted = record.readFully();
        if (encrypted.length < 1 + NONCE_BYTES + 16 || encrypted.length > MAX_BYTES + 64 || encrypted[0] != 1) {
            throw new GeneralSecurityException("Invalid secure storage record");
        }
        ByteBuffer buffer = ByteBuffer.wrap(encrypted);
        buffer.get();
        byte[] nonce = new byte[NONCE_BYTES];
        buffer.get(nonce);
        byte[] ciphertext = new byte[buffer.remaining()];
        buffer.get(ciphertext);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secretKey(false), new GCMParameterSpec(128, nonce));
        cipher.updateAAD(aad(key));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    public synchronized void set(String key, String value) throws IOException, GeneralSecurityException {
        AtomicFile record = record(key);
        if (value == null) throw new IllegalArgumentException("Missing secure value");
        byte[] plaintext = value.getBytes(StandardCharsets.UTF_8);
        if (plaintext.length > MAX_BYTES) throw new IllegalArgumentException("Secure value is too large");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey(true));
        cipher.updateAAD(aad(key));
        byte[] ciphertext = cipher.doFinal(plaintext);
        byte[] nonce = cipher.getIV();
        if (nonce.length != NONCE_BYTES) throw new GeneralSecurityException("Unexpected nonce size");
        byte[] encrypted = ByteBuffer.allocate(1 + nonce.length + ciphertext.length)
            .put((byte) 1).put(nonce).put(ciphertext).array();
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Secure storage unavailable");
        FileOutputStream stream = null;
        try {
            stream = record.startWrite();
            stream.write(encrypted);
            stream.getFD().sync();
            record.finishWrite(stream);
        } catch (IOException exception) {
            if (stream != null) record.failWrite(stream);
            throw exception;
        }
    }

    public synchronized void remove(String key) throws IOException {
        AtomicFile record = record(key);
        record.delete();
        if (record.getBaseFile().exists()) throw new IOException("Secure record could not be removed");
    }

    private AtomicFile record(String key) {
        if (!"auth-session".equals(key) && !"auth-transaction".equals(key)) {
            throw new IllegalArgumentException("Unsupported secure storage key");
        }
        return new AtomicFile(new File(directory, key + ".enc"));
    }

    private byte[] aad(String key) {
        return (namespace + "/" + key).getBytes(StandardCharsets.UTF_8);
    }

    private SecretKey secretKey(boolean create) throws GeneralSecurityException, IOException {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        SecretKey existing = (SecretKey) keyStore.getKey(namespace, null);
        if (existing != null) return existing;
        if (!create) throw new GeneralSecurityException("Secure storage key is unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(namespace, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }
}
