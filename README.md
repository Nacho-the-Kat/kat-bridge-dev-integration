# Kaspa Bridge Script Generator & Parser

Tools for encoding and decoding Kaspa Bridge commit-reveal transactions with KRC-20 token transfers.

## Quick Start

```bash
# Install dependencies
npm install

# Generate a bridge script
node generate-script.js

# Parse a signature script
node parse-script.js --script <hex>
```

## Script Structure

Bridge scripts contain two data lanes:

### EXTRA Lane (Bridge Routing)
- **Marker**: `0x51` (OP_1)
- **Format**: CBOR-encoded `OptimalBridgeBlob`
- **Content**: L2 chain ID, recipient address, signature
- **Size**: ~30 bytes (optimized from ~170 bytes)

### CONTENT Lane (KRC-20 Transfer)
- **Marker**: `0x00` (OP_0) 
- **Format**: JSON string
- **Content**: Token transfer data (protocol, operation, ticker, amount, recipient)
- **Size**: Variable (typically 100-200 bytes)

## Usage

### Generate Script
```javascript
const { generateBridgeScript } = require('./generate-script.js');

const script = generateBridgeScript({
  publicKey: new Uint8Array([...]), // 33-byte compressed public key
  chainId: 1,                        // L2 chain ID (1=mainnet, 167012=sepolia)
  l2Address: "0x1234...",           // L2 recipient address (20 bytes)
  signatureRS: "0x1234...",         // ECDSA signature r+s (64 bytes)
  token: { mode: "mint", tick: "KAS" },
  amountDecimal: "100.5",           // Amount in decimal string
  vaultAddress: "kaspa:..."         // Kaspa vault P2SH address
});
```

### Parse Script
```bash
node parse-script.js --script 4115a7a3138fddd461c81939a116d1f656cb53e85f8f9ae42a8291357dffacc32ffb54fea504d34a6bc6760f316da092f49e895200c630233c4594fd1583503c014cdf201e8313690dec9b3029ba5b0ad273775accfa7a2bb79a1dd2fe7b86f1b3962ac0063076b6173706c6578511d01a736aa0001000000742d35cc6639c2532a78444b5d4f71c8be6e56780068f
```

## Envelope Details

### EXTRA Lane (CBOR Format)
```javascript
{
  v: 1,                    // Version
  c: 167012,              // Chain ID (167012=Sepolia, 1=Mainnet)
  l: Uint8Array(20),      // L2 address (20 bytes)
  s: Uint8Array(64)       // Signature r+s (64 bytes)
}
```

### CONTENT Lane (JSON Format)
```javascript
{
  p: "krc-20",            // Protocol
  op: "mint",             // Operation (mint, transfer, etc.)
  tick: "KAS",            // Token ticker
  amt: "10000000000",     // Amount (8 decimals)
  to: "kaspa:..."         // Recipient address
}
```

## Output

Generated scripts are hex strings compatible with Kaspa's `submitCommitReveal` wallet operations.
