# Kaspa Bridge Integration Guide

Bridge tokens between Kaspa (L1) and Kasplex (L2) networks. Transfer KRC-20 tokens from Kaspa to mint ERC-20 tokens on Kasplex, or burn ERC-20 tokens on Kasplex to receive KRC-20 tokens on Kaspa.

## Quick Start

```bash
npm install
npm run start    # Generate L1→L2 script
npm run burn     # Test L2→L1 burn
npm run parse -- --script <hex>  # Parse script
```

## Bridge Fee API

**Recommended**: Fetch bridge fees dynamically to ensure you're using current rates:

```javascript
const response = await fetch('https://api.katbridge.com/bridge-fee');
const feeData = await response.json();
const currentFeeInKas = feeData.bridgeFeeInKas; // "10"
```

**Response:**
```json
{
  "bridgeFeeInSompi": "1000000000",
  "bridgeFeeWei": "10000000000000000000", 
  "bridgeFeeInKas": "10"
}
```

## L1 → L2 Integration (Kaspa to Kasplex)

Create a Kaspa transaction with a bridge script containing two data lanes:

### Generate Bridge Script
```javascript
const { generateBridgeScript } = require('./generate-script.js');

const script = generateBridgeScript({
  publicKey: new Uint8Array([...]), // 33-byte compressed public key
  chainId: 202555,                  // L2 chain ID (202555 = Kasplex)
  l2Address: "0x1234...",           // L2 recipient address (20 bytes)
  signatureRS: "0x1234...",         // ECDSA signature r+s (64 bytes)
  token: { mode: "mint", tick: "KAS" },
  amountDecimal: "100.5",           // Amount in decimal string
  vaultAddress: "kaspa:..."         // Kaspa vault P2SH address
});
```

### Data Lanes
**EXTRA Lane (CBOR)**: Bridge routing data
```javascript
{
  v: 1,                    // Version
  c: 202555,              // Chain ID (202555=Kasplex)
  l: Uint8Array(20),      // L2 address (20 bytes)
  s: Uint8Array(64)       // Signature r+s (64 bytes)
}
```

**CONTENT Lane (JSON)**: Token transfer data
```javascript
{
  p: "krc-20",            // Protocol
  op: "mint",             // Operation (mint for L1→L2)
  tick: "KAS",            // Token ticker
  amt: "10000000000",     // Amount (8 decimals)
  to: "kaspa:..."         // Recipient address
}
```

## L2 → L1 Integration (Kasplex to Kaspa)

Burn ERC-20 tokens on Kasplex to receive KRC-20 tokens on Kaspa:

### Bridge Contract
```javascript
const CONFIG = {
  CONTRACT: "0x699e7f4a64f6A5a1d7E26B05806d948338E7aDC2",
  RPC: "https://evmrpc.kasplex.org/",
  CHAIN_ID: 202555,
};

const { burnTokens } = require('./burn-bridge-back.js');

const result = await burnTokens({
  privateKey: "0x...",                    // Your private key
  tokenAddress: "0x...",                  // ERC-20 token address
  amount: parseEther("100"),              // Amount to burn (100 tokens)
  kaspaAddress: "kaspa:...",              // Destination Kaspa address
  burnFee: "0x" + parseEther("10").toString(16)  // Bridge fee in hex
});
```

### Function Signature
```solidity
function burnForBridgeBack(
    address _token,        // ERC-20 token contract address
    uint256 _amount,       // Amount of tokens to burn (in token's smallest unit)
    string _kaspaAddress   // Kaspa address to receive the tokens
) external payable
```

## API Reference

### generateBridgeScript(options)
Generates a bridge script for L1→L2 operations.

**Parameters:**
- `publicKey` (Uint8Array): 33-byte compressed public key
- `chainId` (number): L2 chain ID (202555 for Kasplex)
- `l2Address` (string): L2 recipient address (20 bytes)
- `signatureRS` (string): ECDSA signature r+s (64 bytes)
- `token` (object): Token configuration
  - `mode` (string): "mint" for L1→L2
  - `tick` (string): Token ticker
- `amountDecimal` (string): Amount in decimal string
- `vaultAddress` (string): Kaspa vault P2SH address

**Returns:** Hex string compatible with Kaspa's `submitCommitReveal` operations

### burnTokens(options)
Burns ERC-20 tokens for L2→L1 operations.

**Parameters:**
- `privateKey` (string): Private key for signing
- `tokenAddress` (string): ERC-20 token contract address
- `amount` (BigNumber): Amount to burn
- `kaspaAddress` (string): Destination Kaspa address
- `burnFee` (string, optional): Bridge fee in hex

**Returns:** Transaction result object

---

**Bridge Fee API**: `https://api.katbridge.com/bridge-fee`  
**Bridge Contract**: `0x699e7f4a64f6A5a1d7E26B05806d948338E7aDC2`  
**Support**: https://discord.gg/TGA76ahDeb