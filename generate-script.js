// === Updated Bridge Script Generator ===
// This script has been updated to match the parse-script.js expectations:
// - Uses "kasplex" envelope identifier (matching parse-script.js)
// - Uses KRC-20 protocol for token transfers (matching parse-script.js)
// - Uses amount parameter for token amounts
// - Attempts to use cbor-x library for proper CBOR encoding
// - Falls back to custom CBOR implementation if cbor-x is not available

// === CBOR-X Implementation ===
// Using cbor-x library for proper CBOR encoding (matching bridge-ui implementation)
let cborEncode;

// Try to load cbor-x library
try {
  const cborX = require('cbor-x');
  cborEncode = cborX.encode;
} catch (error) {
  console.warn('cbor-x library not found, falling back to custom implementation');
  
  // Fallback custom CBOR implementation
  cborEncode = function(value) {
    const encoder = new TextEncoder();
    
    if (typeof value === 'number') {
      if (Number.isInteger(value) && value >= 0) {
        if (value < 24) {
          return new Uint8Array([0x00 | value]);
        } else if (value < 256) {
          return new Uint8Array([0x18, value]);
        } else if (value < 65536) {
          return new Uint8Array([0x19, value >> 8, value & 0xff]);
        } else if (value < 4294967296) {
          return new Uint8Array([0x1a, value >> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
        }
      }
    }
    
    if (value instanceof Uint8Array) {
      const len = value.length;
      let header;
      if (len < 24) {
        header = new Uint8Array([0x40 | len]);
      } else if (len < 256) {
        header = new Uint8Array([0x58, len]);
      } else if (len < 65536) {
        header = new Uint8Array([0x59, len >> 8, len & 0xff]);
      } else {
        throw new Error('Data too large for CBOR');
      }
      const result = new Uint8Array(header.length + len);
      result.set(header, 0);
      result.set(value, header.length);
      return result;
    }
    
    if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value);
      const mapHeader = new Uint8Array([0xa0 | entries.length]);
      const parts = [mapHeader];
      
      for (const [key, val] of entries) {
        // Encode key (assuming string keys)
        const keyBytes = encoder.encode(key);
        const keyLen = keyBytes.length;
        let keyHeader;
        if (keyLen < 24) {
          keyHeader = new Uint8Array([0x60 | keyLen]);
        } else if (keyLen < 256) {
          keyHeader = new Uint8Array([0x78, keyLen]);
        } else {
          throw new Error('Key too long for CBOR');
        }
        parts.push(keyHeader, keyBytes);
        
        // Encode value
        parts.push(cborEncode(val));
      }
      
      const totalLen = parts.reduce((sum, part) => sum + part.length, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
      }
      return result;
    }
    
    throw new Error('Unsupported CBOR type');
  };
}

// === Utility Functions ===
function bytesToHex(bytes) {
  const hex = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return '0x' + hex.join('');
}

function hexToBytes(hex) {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error('invalid hex length');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function ensureAddressBytes20(addr) {
  const bytes = hexToBytes(addr);
  if (bytes.length !== 20) throw new Error('address must be 20 bytes');
  return bytes;
}

function buildKrc20TransferJSON(token, amount, toKaspaAddress) {
  const base = { p: 'krc-20', op: 'transfer', amt: amount.toString(), to: toKaspaAddress };
  const json = token.mode === 'issue' ? { ...base, ca: token.ca } : { ...base, tick: token.tick };
  return JSON.stringify(json);
}

// === Main Functions ===
function buildOptimalExtraAndContent(params) {
  const l2Bytes = ensureAddressBytes20(params.l2Address);
  const sigBytes = hexToBytes(params.signatureRS);
  if (sigBytes.length !== 64) throw new Error('signature must be 64 bytes (r+s without v)');

  const blob = {
    v: 1,                    // version
    c: params.chainId,       // chainId (shortened key for CBOR efficiency)
    l: l2Bytes,              // L2 address (shortened key)
    s: sigBytes,             // signature r+s (shortened key)
  };

  const extra = cborEncode(blob);
  const content = buildKrc20TransferJSON(params.token, params.amount, params.to);

  return { extra, content };
}

function buildEnvelopeSuffix(extra, contentJson) {
  const enc = new TextEncoder();
  const parts = [];
  
  // OP_FALSE
  parts.push(new Uint8Array([0x00]));
  // OP_IF
  parts.push(new Uint8Array([0x63]));
  // "kasplex" (matching parse-script.js expectations)
  parts.push(new Uint8Array([0x07]), enc.encode('kasplex'));

  if (extra && extra.length > 0) {
    // OP_1
    parts.push(new Uint8Array([0x51]));
    // Push extra data
    if (extra.length <= 0x4b) {
      parts.push(new Uint8Array([extra.length]), extra);
    } else if (extra.length <= 0xff) {
      parts.push(new Uint8Array([0x4c, extra.length]), extra);
    } else {
      throw new Error('Extra data too large');
    }
  }

  // OP_FALSE (marker 0)
  parts.push(new Uint8Array([0x00]));
  // Push content
  const contentBytes = enc.encode(contentJson);
  if (contentBytes.length <= 0x4b) {
    parts.push(new Uint8Array([contentBytes.length]), contentBytes);
  } else if (contentBytes.length <= 0xff) {
    parts.push(new Uint8Array([0x4c, contentBytes.length]), contentBytes);
  } else {
    throw new Error('Content too large');
  }
  
  // OP_ENDIF
  parts.push(new Uint8Array([0x68]));

  const totalLen = parts.reduce((sum, part) => sum + part.length, 0);
  const suffix = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    suffix.set(part, offset);
    offset += part.length;
  }
  
  if (suffix.length > 520) throw new Error('envelope too large (>520 bytes)');
  return suffix;
}

function buildSingleSigRedeem(pubkey33, envelopeSuffix) {
  // Convert 33-byte compressed to 32-byte x-only if needed
  const isCompressed = pubkey33.length === 33 && (pubkey33[0] === 0x02 || pubkey33[0] === 0x03);
  const isXOnly = pubkey33.length === 32;
  if (!isCompressed && !isXOnly) throw new Error('pubkey must be 33-byte compressed or 32-byte x-only');

  const pubkeyXOnly = isCompressed ? pubkey33.slice(1) : pubkey33;

  const parts = [];
  
  // Push public key
  if (pubkeyXOnly.length <= 0x4b) {
    parts.push(new Uint8Array([pubkeyXOnly.length]), pubkeyXOnly);
  } else {
    throw new Error('Public key too large');
  }
  
  // OP_CHECKSIG
  parts.push(new Uint8Array([0xac]));
  
  // Envelope suffix
  parts.push(envelopeSuffix);

  const totalLen = parts.reduce((sum, part) => sum + part.length, 0);
  const redeem = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    redeem.set(part, offset);
    offset += part.length;
  }
  
  if (redeem.length > 520) throw new Error('redeem exceeds 520-byte limit');
  return redeem;
}

// === Main Export Function ===
function generateBridgeScript(params) {
  // Validate required parameters
  if (!params.publicKey) throw new Error('publicKey is required');
  if (!params.chainId) throw new Error('chainId is required');
  if (!params.l2Address) throw new Error('l2Address is required');
  if (!params.signatureRS) throw new Error('signatureRS is required');
  if (!params.token) throw new Error('token is required');
  if (!params.amount) throw new Error('amount is required');
  if (!params.to) throw new Error('to is required');

  // Build the optimal extra and content
  const { extra, content } = buildOptimalExtraAndContent({
    chainId: params.chainId,
    l2Address: params.l2Address,
    signatureRS: params.signatureRS,
    token: params.token,
    amount: params.amount,
    to: params.to,
  });

  // Build envelope suffix
  const envelopeSuffix = buildEnvelopeSuffix(extra, content);

  // Build final redeem script
  const redeemScript = buildSingleSigRedeem(params.publicKey, envelopeSuffix);

  return redeemScript;
}

// Export for Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateBridgeScript };
}

// Export for browser/ES modules
if (typeof window !== 'undefined') {
  window.generateBridgeScript = generateBridgeScript;
}

// Test function to demonstrate usage
function testScriptGeneration() {
  try {
    console.log('Testing script generation...');
    
    // Create a valid 33-byte compressed public key (example)
    const publicKey = new Uint8Array(33);
    publicKey[0] = 0x02; // Compressed key prefix
    for (let i = 1; i < 33; i++) {
      publicKey[i] = i; // Fill with test data
    }
    
    // Create a valid 64-byte signature (r+s, no v)
    const signatureRS = '0x' + '1234567890abcdef'.repeat(8); // 64 bytes
    
    const script = generateBridgeScript({
      publicKey: publicKey,
      chainId: 202555,
      l2Address: "0xaeF33e76972C08b8AC19221cB6e7d2fa4054af43",
      signatureRS: signatureRS,
      token: { mode: "mint", tick: "NACHO" },
      amount: 100000000, // 1 token in base units
      to: "kaspa:qryv8wv2g9y5mz6k8r7n4t3x1c2v5b6n9m0p1q2w3e4r5t6y7u8i9o0p"
    });

    console.log('✅ Script generated successfully!');
    console.log('Script length:', script.length, 'bytes');
    console.log('Script hex:', bytesToHex(script));
  } catch (error) {
    console.error('❌ Error generating script:', error.message);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testScriptGeneration();
}
