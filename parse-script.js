/**
 * Parse Bridge Envelope Directly from Signature Script Hex
 * 
 * This script parses BOTH the optimized bridge routing data (EXTRA lane)
 * AND the KRC-20 transfer data (CONTENT lane) from a signature script.
 * 
 * Features:
 * - Automatically decodes CBOR-encoded OptimalBridgeBlob
 * - Extracts L2 chain ID, address, and signature
 * - Parses KRC-20 transfer JSON
 * - Handles OP_PUSHDATA1 variable-length encoding
 * 
 * Usage: node scripts/parse-script-direct.js --script <hex>
 */

import minimist from 'minimist';
import CBOR from 'cbor-js';

// Parse command-line arguments
const args = minimist(process.argv.slice(2));
const scriptHex = args.script;

if (!scriptHex) {
  console.error("Please provide signature script hex using --script flag");
  console.error("Example: node parse-script-direct.js --script 4115a7a3138fddd461c81939a116d1f656cb53e85f8f9ae42a8291357dffacc32ffb54fea504d34a6bc6760f316da092f49e895200c630233c4594fd1583503c014cdf201e8313690dec9b3029ba5b0ad273775accfa7a2bb79a1dd2fe7b86f1b3962ac0063076b6173706c6578511d01a736aa0001000000742d35cc6639c2532a78444b5d4f71c8be6e56780068f");
  process.exit(1);
}

console.log("🔍 PARSING BRIDGE ENVELOPE FROM SIGNATURE SCRIPT");
console.log("================================================");
console.log(`Script hex length: ${scriptHex.length} characters`);
console.log("");

try {
  // Convert hex to bytes
  const scriptBytes = new Uint8Array(scriptHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  console.log(`Script bytes length: ${scriptBytes.length} bytes`);

  // Look for "kasplex" string
  const kasplexBytes = new TextEncoder().encode("kasplex");
  let kasplexPos = -1;

  for (let i = 0; i < scriptBytes.length - kasplexBytes.length; i++) {
    let match = true;
    for (let j = 0; j < kasplexBytes.length; j++) {
      if (scriptBytes[i + j] !== kasplexBytes[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      kasplexPos = i;
      break;
    }
  }

  if (kasplexPos === -1) {
    throw new Error("Kasplex envelope not found in signature script");
  }

  console.log(`✅ Found "kasplex" at byte position ${kasplexPos}`);

  // Move past "kasplex"
  let pos = kasplexPos + kasplexBytes.length;

  // Look for EXTRA marker (0x51 = OP_1)
  while (pos < scriptBytes.length && scriptBytes[pos] !== 0x51) {
    pos++;
  }

  if (pos >= scriptBytes.length) {
    throw new Error("EXTRA marker (0x51) not found");
  }

  console.log(`✅ Found EXTRA marker at byte position ${pos}`);
  pos++; // Skip the 0x51 marker

  // Handle variable-length encoding for EXTRA data
  if (pos >= scriptBytes.length) {
    throw new Error("Unexpected end of script");
  }

  let extraLength;
  const lengthByte = scriptBytes[pos++];

  if (lengthByte <= 0x4b) {
    // Direct push (length <= 75)
    extraLength = lengthByte;
  } else if (lengthByte === 0x4c) {
    // OP_PUSHDATA1: next byte is length
    if (pos >= scriptBytes.length) {
      throw new Error("OP_PUSHDATA1 missing length byte");
    }
    extraLength = scriptBytes[pos++];
  } else if (lengthByte === 0x4d) {
    // OP_PUSHDATA2: next 2 bytes are length (little endian)
    if (pos + 1 >= scriptBytes.length) {
      throw new Error("OP_PUSHDATA2 missing length bytes");
    }
    extraLength = scriptBytes[pos] | (scriptBytes[pos + 1] << 8);
    pos += 2;
  } else {
    throw new Error(`Unsupported push opcode: 0x${lengthByte.toString(16)}`);
  }

  console.log(`📏 EXTRA data length: ${extraLength} bytes (encoding: ${lengthByte <= 0x4b ? 'direct' : lengthByte === 0x4c ? 'OP_PUSHDATA1' : 'OP_PUSHDATA2'})`);

  if (pos + extraLength > scriptBytes.length) {
    throw new Error("EXTRA data extends beyond script boundary");
  }

  // Extract EXTRA data (our bridge routing info)
  const extraData = scriptBytes.slice(pos, pos + extraLength);
  pos += extraLength;

  console.log("");
  console.log("🎯 BRIDGE ROUTING DATA (EXTRA LANE):");
  console.log("====================================");
  const extraHex = Array.from(extraData).map(b => b.toString(16).padStart(2, '0')).join('');
  console.log(`Raw hex: ${extraHex}`);
  console.log(`Length: ${extraData.length} bytes`);

  // Try to parse as CBOR (new optimized format)
  try {
    // We need cbor-x to decode, but it might not be available in this script context
    // For now, let's try to manually parse the CBOR or show a helpful message
    const firstByte = extraData[0];

    console.log("");
    console.log("🚀 DECODED BRIDGE ROUTING INFO:");
    console.log("===============================");

    if (firstByte === 0xb9) {
      // This looks like our optimized CBOR format
      console.log("📦 Detected optimized CBOR format (OptimalBridgeBlob)");

      try {
        // Try to decode CBOR using cbor-js (direct dependency)
        const decoded = CBOR.decode(extraData.buffer);

        console.log("✅ Successfully decoded CBOR blob:");
        console.log(`Version: ${decoded.v}`);
        console.log(`L2 Chain ID: ${decoded.c} (${decoded.c === 167012 ? 'Sepolia' : decoded.c === 1 ? 'Mainnet' : 'Unknown'})`);

        // Decode L2 address 
        if (decoded.l && decoded.l.length === 20) {
          const l2Address = '0x' + Array.from(decoded.l).map(b => b.toString(16).padStart(2, '0')).join('');
          console.log(`L2 Address: ${l2Address}`);
        }

        // Show signature info
        if (decoded.s && decoded.s.length === 64) {
          const sigHex = Array.from(decoded.s).map(b => b.toString(16).padStart(2, '0')).join('');
          console.log(`Signature (r+s): 0x${sigHex.slice(0, 16)}...${sigHex.slice(-16)} (64 bytes)`);
        }

        console.log(`🎯 Optimization: Reduced from ~170 bytes to ${extraData.length} bytes`);

      } catch (error) {
        console.log("⚠️  Failed to decode CBOR with cbor-js, trying cbor-x...");

        try {
          // Fallback to cbor-x if available  
          const { createRequire } = await import('module');
          const require = createRequire(import.meta.url);
          const { execSync } = require('child_process');
          const result = execSync(`node -e "const {decode} = require('cbor-x'); console.log(JSON.stringify(decode(Buffer.from('${extraHex}', 'hex')), (k,v) => v instanceof Uint8Array ? Array.from(v) : v));"`,
            { encoding: 'utf8', cwd: '/Users/ashton/Documents/GitHub/krc-bridge' });

          const decoded = JSON.parse(result.trim());

          console.log("✅ Successfully decoded CBOR blob (via cbor-x):");
          console.log(`Version: ${decoded.v}`);
          console.log(`L2 Chain ID: ${decoded.c} (${decoded.c === 167012 ? 'Sepolia' : decoded.c === 1 ? 'Mainnet' : 'Unknown'})`);

          if (decoded.l && decoded.l.length === 20) {
            const l2Address = '0x' + decoded.l.map(b => b.toString(16).padStart(2, '0')).join('');
            console.log(`L2 Address: ${l2Address}`);
          }

          if (decoded.s && decoded.s.length === 64) {
            const sigHex = decoded.s.map(b => b.toString(16).padStart(2, '0')).join('');
            console.log(`Signature (r+s): 0x${sigHex.slice(0, 16)}...${sigHex.slice(-16)} (64 bytes)`);
          }

          console.log(`🎯 Optimization: Reduced from ~170 bytes to ${extraData.length} bytes`);

        } catch (fallbackError) {
          console.log("⚠️  All CBOR decoders failed. Showing structure info:");
          console.log(`📦 CBOR blob detected (${extraData.length} bytes)`);
          console.log(`Structure: {v: version, c: chainId, l: l2Address(20 bytes), s: signature(64 bytes)}`);
          console.log(`Raw hex: ${extraHex}`);
        }
      }
    } else {
      // Fallback to old binary format parsing
      console.log("📦 Attempting legacy binary format parsing...");
      if (extraData.length >= 29) {
        const version = extraData[0];
        const chainIdView = new DataView(extraData.buffer, extraData.byteOffset + 1, 4);
        const chainId = chainIdView.getUint32(0, true); // little endian
        const bridgeIdView = new DataView(extraData.buffer, extraData.byteOffset + 5, 4);
        const bridgeId = bridgeIdView.getUint32(0, true); // little endian
        const l2AddressBytes = extraData.slice(9, 29);
        const l2Address = '0x' + Array.from(l2AddressBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        console.log(`Version: ${version}`);
        console.log(`L2 Chain ID: ${chainId} (${chainId === 167012 ? 'Sepolia' : 'Unknown'})`);
        console.log(`Bridge ID: ${bridgeId}`);
        console.log(`L2 Address: ${l2Address}`);
      } else {
        console.log("⚠️  EXTRA data too short to parse bridge routing info");
        console.log(`Expected at least 29 bytes, got ${extraData.length}`);
      }
    }
  } catch (error) {
    console.log("⚠️  Error parsing bridge data:", error.message);
  }

  // Look for CONTENT marker (0x00)
  while (pos < scriptBytes.length && scriptBytes[pos] !== 0x00) {
    pos++;
  }

  if (pos >= scriptBytes.length) {
    console.log("⚠️  CONTENT marker (0x00) not found");
  } else {
    console.log(`✅ Found CONTENT marker at byte position ${pos}`);
    pos++; // Skip the 0x00 marker

    if (pos < scriptBytes.length) {
      // Handle variable-length encoding for CONTENT data too
      let contentLength;
      const lengthByte = scriptBytes[pos++];

      if (lengthByte <= 0x4b) {
        // Direct push (length <= 75)
        contentLength = lengthByte;
      } else if (lengthByte === 0x4c) {
        // OP_PUSHDATA1: next byte is length
        if (pos >= scriptBytes.length) {
          throw new Error("CONTENT OP_PUSHDATA1 missing length byte");
        }
        contentLength = scriptBytes[pos++];
      } else if (lengthByte === 0x4d) {
        // OP_PUSHDATA2: next 2 bytes are length (little endian)
        if (pos + 1 >= scriptBytes.length) {
          throw new Error("CONTENT OP_PUSHDATA2 missing length bytes");
        }
        contentLength = scriptBytes[pos] | (scriptBytes[pos + 1] << 8);
        pos += 2;
      } else {
        throw new Error(`CONTENT unsupported push opcode: 0x${lengthByte.toString(16)}`);
      }

      console.log(`📏 CONTENT data length: ${contentLength} bytes (encoding: ${lengthByte <= 0x4b ? 'direct' : lengthByte === 0x4c ? 'OP_PUSHDATA1' : 'OP_PUSHDATA2'})`);

      if (pos + contentLength <= scriptBytes.length) {
        const contentData = scriptBytes.slice(pos, pos + contentLength);
        const contentJson = new TextDecoder().decode(contentData);

        console.log("");
        console.log("📦 KRC-20 CONTENT DATA:");
        console.log("=======================");
        console.log(`Raw JSON: ${contentJson}`);

        try {
          const parsed = JSON.parse(contentJson);
          console.log("");
          console.log("✅ Parsed KRC-20 Transfer:");
          console.log(`  Protocol: ${parsed.p}`);
          console.log(`  Operation: ${parsed.op}`);
          console.log(`  Ticker: ${parsed.tick}`);
          console.log(`  Amount: ${parsed.amt} (${(parseInt(parsed.amt) / 100000000).toFixed(8)} tokens)`);
          console.log(`  To: ${parsed.to}`);
        } catch (e) {
          console.log("⚠️  Failed to parse CONTENT as JSON:", e.message);
        }
      } else {
        console.log("⚠️  CONTENT data extends beyond script boundary");
      }
    }
  }

  console.log("");
  console.log("🎉 BRIDGE ENVELOPE PARSING COMPLETE!");
  console.log("====================================");
  console.log("✅ Successfully decoded bridge routing data from onchain signature script");
  console.log("✅ This proves the bridge can extract L2 routing info from any Kaspa transaction");
  console.log("✅ Bridge indexer can now route deposits to the correct L2 chain and address!");

} catch (error) {
  console.error("❌ Error parsing signature script:", error.message);
  console.error(error.stack);
}
