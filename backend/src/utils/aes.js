import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "crypto";

/**
 * Derive a 32-byte key from a password and salt using scrypt (sync).
 */
function deriveKey(password, salt) {
    return scryptSync(password, salt, 32);
  }
  
  /**
   * Encrypt plaintext using AES-256-GCM with scrypt key derivation.
   * Returns a compact string: base64(salt):base64(iv):base64(tag):base64(ciphertext)
   *
   * @param {string} plaintext - Data to encrypt
   * @returns {string}
   */
  export function encryptAES(plaintext) {
    if (typeof plaintext !== "string") {
      throw new TypeError("encryptAES: plaintext must be a string");
    }
  
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = deriveKey(process.env.PASSWORD, salt);
  
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
  
    return [salt.toString("base64"), iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
  }
  
  /**
   * Decrypt data produced by encryptAES.
   * Accepts the string format base64(salt):base64(iv):base64(tag):base64(ciphertext)
   * and returns the original plaintext string.
   *
   * @param {string} payload - The encoded encrypted string
   * @returns {string}
   */
  export function decryptAES(payload) {
    if (typeof payload !== "string" || payload.length === 0) {
      throw new TypeError("decryptAES: payload must be a non-empty string");
    }
  
    const parts = payload.split(":");
    if (parts.length !== 4) {
      throw new Error("decryptAES: invalid payload format");
    }
  
    const [saltB64, ivB64, tagB64, ciphertextB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");
  
    const key = deriveKey(process.env.PASSWORD, salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
  
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  }