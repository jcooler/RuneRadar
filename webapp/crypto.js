/**
 * RuneRadar — E2E Position Encryption
 *
 * Encrypts position data so the relay server cannot read coordinates.
 * The relay only sees opaque blobs and routes them based on social graph matching.
 *
 * Key derivation:
 *   Friends: SHA-256(sort(rsn1, rsn2) + ":runeradar-e2e")
 *   Clan:    SHA-256("clan:" + clanName + ":runeradar-e2e")
 *   FC:      SHA-256("fc:" + fcName + ":runeradar-e2e")
 *
 * Encryption: AES-GCM with 12-byte random IV, 128-bit auth tag
 * Payload: base64(IV + ciphertext + tag)
 */

const E2E_SALT = "runeradar-e2e";

const _keyCache = new Map(); // cacheKey → CryptoKey

/**
 * Derive an AES-GCM key for a friend pair.
 */
async function deriveFriendKey(rsn1, rsn2) {
  const sorted = [rsn1.toLowerCase(), rsn2.toLowerCase()].sort();
  const cacheKey = "f:" + sorted.join(":");
  return _deriveKey(cacheKey, sorted[0] + ":" + sorted[1] + ":" + E2E_SALT);
}

/**
 * Derive an AES-GCM key for a clan/FC group.
 */
async function deriveGroupKey(prefix, groupName) {
  const cacheKey = prefix + ":" + groupName.toLowerCase();
  return _deriveKey(cacheKey, prefix + ":" + groupName.toLowerCase() + ":" + E2E_SALT);
}

async function _deriveKey(cacheKey, material) {
  if (_keyCache.has(cacheKey)) return _keyCache.get(cacheKey);

  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  const key = await crypto.subtle.importKey(
    "raw", raw.slice(0, 16), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
  );
  _keyCache.set(cacheKey, key);
  return key;
}

/**
 * Encrypt a position payload object → base64 string.
 */
async function encryptPosition(positionObj, cryptoKey) {
  const plaintext = new TextEncoder().encode(JSON.stringify(positionObj));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    plaintext
  );

  // Combine IV + ciphertext into one buffer
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64 payload → position object.
 */
async function decryptPosition(base64Data, cryptoKey) {
  try {
    const combined = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      cryptoKey,
      ciphertext
    );

    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null; // decryption failed — wrong key or corrupted data
  }
}
