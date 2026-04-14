package com.runeradar;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * E2E encryption for position data.
 *
 * Position coordinates are encrypted with AES-128-GCM before being sent to the relay.
 * The relay cannot decrypt them — only matched peers with the correct shared key can.
 *
 * Key derivation:
 *   Friends: SHA-256(sort(rsn1, rsn2) + ":runeradar-e2e") → first 16 bytes
 *   Clan:    SHA-256("clan:" + clanName + ":runeradar-e2e") → first 16 bytes
 *   FC:      SHA-256("fc:" + fcName + ":runeradar-e2e") → first 16 bytes
 *
 * Wire format: Base64(IV[12] + ciphertext + GCM_tag[16])
 */
public class PositionCrypto
{
    private static final String E2E_SALT = "runeradar-e2e";
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Map<String, SecretKeySpec> KEY_CACHE = new ConcurrentHashMap<>();

    /**
     * Derive an AES key for a friend pair (mutual).
     */
    public static SecretKeySpec deriveFriendKey(String rsn1, String rsn2)
    {
        String[] sorted = { rsn1.toLowerCase(), rsn2.toLowerCase() };
        Arrays.sort(sorted);
        String material = sorted[0] + ":" + sorted[1] + ":" + E2E_SALT;
        return deriveKey("f:" + sorted[0] + ":" + sorted[1], material);
    }

    /**
     * Derive an AES key for a clan.
     */
    public static SecretKeySpec deriveClanKey(String clanName)
    {
        String material = "clan:" + clanName.toLowerCase() + ":" + E2E_SALT;
        return deriveKey("c:" + clanName.toLowerCase(), material);
    }

    /**
     * Derive an AES key for a friends chat.
     */
    public static SecretKeySpec deriveFcKey(String fcName)
    {
        String material = "fc:" + fcName.toLowerCase() + ":" + E2E_SALT;
        return deriveKey("fc:" + fcName.toLowerCase(), material);
    }

    private static SecretKeySpec deriveKey(String cacheKey, String material)
    {
        return KEY_CACHE.computeIfAbsent(cacheKey, k ->
        {
            try
            {
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                byte[] hash = sha.digest(material.getBytes(StandardCharsets.UTF_8));
                return new SecretKeySpec(Arrays.copyOf(hash, 16), "AES");
            }
            catch (Exception e)
            {
                throw new RuntimeException("Failed to derive key", e);
            }
        });
    }

    /**
     * Encrypt a JSON position payload → Base64 string.
     */
    public static String encrypt(String json, SecretKeySpec key) throws Exception
    {
        byte[] iv = new byte[IV_LENGTH];
        RANDOM.nextBytes(iv);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
        byte[] ciphertext = cipher.doFinal(json.getBytes(StandardCharsets.UTF_8));

        // Combine IV + ciphertext (includes GCM tag)
        byte[] combined = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

        return Base64.getEncoder().encodeToString(combined);
    }

    /**
     * Decrypt a Base64 payload → JSON string. Returns null on failure.
     */
    public static String decrypt(String base64Data, SecretKeySpec key)
    {
        try
        {
            byte[] combined = Base64.getDecoder().decode(base64Data);
            byte[] iv = Arrays.copyOfRange(combined, 0, IV_LENGTH);
            byte[] ciphertext = Arrays.copyOfRange(combined, IV_LENGTH, combined.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);

            return new String(plaintext, StandardCharsets.UTF_8);
        }
        catch (Exception e)
        {
            return null;
        }
    }
}
