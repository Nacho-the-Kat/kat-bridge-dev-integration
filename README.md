# Kaspa Bridge Integration Guide

Bridge tokens between Kaspa (L1) and Kasplex (L2) networks. Transfer KRC-20 tokens from Kaspa to mint ERC-20 tokens on Kasplex, or burn ERC-20 tokens on Kasplex to receive KRC-20 tokens on Kaspa.

## Overview

The Kaspa Bridge enables seamless token transfers between:
- **Layer 1 (L1)**: Kaspa mainnet with KRC-20 inscription-based tokens
- **Layer 2 (L2)**: Kasplex EVM chain with ERC-20 tokens

### Bridge Architecture

The bridge uses a **5-relayer consensus model** with **3-of-5 multi-signature security**:
- 5 distributed relayers monitor both chains
- At least 3 relayers must agree before processing any transaction
- L1→L2: Relayers detect KRC-20 deposits and mint ERC-20 tokens
- L2→L1: Relayers coordinate FROST psuedo-multi-sig releases of KRC-20 tokens

### Bridge Addresses

**L1 Bridge Vault Address** (where KRC-20 tokens are sent):
```
kaspa:qrf5mw2ru0av3dgfmkhvh0hets8k84wxcaqqr3jv9wdf6st44h0cxql4syxt8
```

**L1 Bridge Fee Address** (where bridge fees are sent):
```
kaspa:qypca63358auyh2hxdvnxmjleu7snzytrkgwt46a3tr6k2l8xcpvelqhygnprgs
```

**L2 Bridge Contract** (Kasplex EVM L2):
```
0x699e7f4a64f6A5a1d7E26B05806d948338E7aDC2
```

**Chain ID**: `202555` (Kasplex EVM L2)

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

## Token Pair API

**Endpoint**: `https://api.katbridge.com/token-pair`

Fetch available token pairs for bridging between L1 (KRC-20) and L2 (ERC-20).

**Response:**
```json
{
  "success": true,
  "result": [
    {
      "id": 14,
      "l1_name": "BADEGG",
      "l1_symbol": "BADEGG", 
      "l1_decimals": 8,
      "l1_logo_url": "https://krc20-assets.kas.fyi/icons/BADEGG.jpg",
      "l2_name": "BADEGG",
      "l2_symbol": "BADEGG",
      "l2_decimals": 18,
      "l2_chain_id": 202555,
      "l2_address": "0xAefC070d1c4023DdAfc5F3f77181EeD8CB70277d",
      "l2_logo_url": "https://krc20-assets.kas.fyi/icons/BADEGG.jpg",
      "created_at": "2025-09-26T14:31:15.000Z",
      "updated_at": "2025-09-26T14:31:15.000Z",
      "tokenHash": "0x2c95459bfda60671c20122235e0f4fbeb698be2f0bc45a74a3c49ee79f8cf44b",
      "maxSupply": "21000000000000000000000000000",
      "is_active": true
    }
  ]
}
```

**Key Fields:**
- `tokenHash`: Use this in the EVM message `TokenIdHash` field
- `l2_address`: L2 ERC-20 token contract address for burning
- `l1_decimals`: L1 token decimals (typically 8)
- `l2_decimals`: L2 token decimals (typically 18)
- `is_active`: Whether the token pair is available for bridging

**Example Usage:**
```javascript
const response = await fetch('https://api.katbridge.com/token-pair');
const data = await response.json();

// Find a specific token by symbol
const kasToken = data.result.find(token => token.l1_symbol === 'KAS');
if (kasToken) {
  const tokenIdHash = kasToken.tokenHash; // Use in EVM message
  const l2Address = kasToken.l2_address;  // Use for burning
}
```

## L1 → L2 Integration (Kaspa to Kasplex)

### Workflow Overview

1. **User signs EVM message** on L2 wallet with bridge data
2. **Generate KRC-20 script** containing the signed EVM data
3. **Create commit transaction** on Kaspa L1 with the script
4. **Create reveal transaction** spending the commit UTXO
5. **5 relayers detect** the deposit and validate the data
6. **At least 3 relayers agree** and mint ERC-20 tokens on L2

### Step-by-Step Implementation

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Sign EVM Message on L2 Wallet

Before creating the L1 transaction, users must sign an EVM message on their L2 wallet. This message contains the bridge routing information:

```javascript
import { ethers } from 'ethers';

// Get user's L2 wallet
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const l2Address = await signer.getAddress();

// Get token pair info
const tokenPairResponse = await fetch('https://api.katbridge.com/token-pair');
const tokenPairData = await tokenPairResponse.json();
const tokenPair = tokenPairData.result.find(token => token.l1_symbol === 'KAS');

// Prepare message
const message = {
  BridgeIdHash: "0x1c5cf638141e1db790250efebf1a3ef4abf0123e93339d69bf6e201df2624cc9",
  ChainId: "202555",
  L2: l2Address,
  TokenIdHash: tokenPair.tokenIdHash,
  Amount: "200000000", // 2 KAS in sompi
  Nonce: "1"
};

// Sign the message
const signature = await signer.signTypedData({
  name: "KaspaBridge",
  version: "1",
  chainId: 202555
}, {
  KaspaBridgeDeposit: [
    { name: "BridgeIdHash", type: "bytes32" },
    { name: "ChainId", type: "uint256" },
    { name: "L2", type: "address" },
    { name: "TokenIdHash", type: "bytes32" },
    { name: "Amount", type: "uint256" },
    { name: "Nonce", type: "uint256" }
  ]
}, message);

// Extract r+s (64 bytes) for the bridge script
const sig = ethers.Signature.from(signature);
const signatureRS = sig.r.slice(2) + sig.s.slice(2); // Remove 0x and v
```

#### 3. Generate Bridge Script
Create a Kaspa transaction with a bridge script containing the signed EVM data. This repo includes `generate-script.js` - an example script that generates an envelope containing EVM data. The bridge indexer parses this envelope and triggers mint events on Kasplex based on the EVM data inside envelope:
```javascript
const { generateBridgeScript } = require('./generate-script.js');

const script = generateBridgeScript({
  publicKey: new Uint8Array([...]), // 33-byte compressed public key
  chainId: 202555,                  // L2 chain ID (202555 = Kasplex)
  l2Address: l2Address,             // L2 recipient address from EVM signing
  signatureRS: signatureRS,         // ECDSA signature r+s (64 bytes) from EVM signing
  token: { mode: "mint", tick: "KAS" },
  amountDecimal: "2.0",             // Amount in decimal string (2 KAS)
  vaultAddress: "kaspa:qrf5mw2ru0av3dgfmkhvh0hets8k84wxcaqqr3jv9wdf6st44h0cxql4syxt8" // Bridge vault address
});
```

#### 4. Create Kaspa Transactions

Create commit and reveal transactions with the script and send to vault + fee addresses.

### EVM Message Structure

The EIP-712 message structure for signing:

```javascript
// EIP-712 Message Structure
{
  "primaryType": "KaspaBridgeDeposit",
  "domain": {
    "name": "KaspaBridge",
    "version": "1",
    "chainId": 202555
  },
  "types": {
    "KaspaBridgeDeposit": [
      { "name": "BridgeIdHash", "type": "bytes32" },
      { "name": "ChainId", "type": "uint256" },
      { "name": "L2", "type": "address" },
      { "name": "TokenIdHash", "type": "bytes32" },
      { "name": "Amount", "type": "uint256" },
      { "name": "Nonce", "type": "uint256" }
    ]
  },
  "message": {
    "BridgeIdHash": "0x1c5cf638141e1db790250efebf1a3ef4abf0123e93339d69bf6e201df2624cc9",
    "ChainId": "202555",
    "L2": "0x...", // User's L2 wallet address
    "TokenIdHash": "0x...", // From https://api.katbridge.com/token-pair endpoint
    "Amount": "200000000", // Amount in L1 sompi (not L2 wei)
    "Nonce": "1"
  }
}
```

### Complete L1 → L2 Example

```javascript
// 1. Sign EVM message (as shown above)
const signatureRS = "0x1234..."; // 64 bytes r+s
const l2Address = "0x742d35cc6639c2532a78444b5d4f71c8be6e5678";

// 2. Generate bridge script
const script = generateBridgeScript({
  publicKey: userKaspaPublicKey, // 33-byte compressed public key
  chainId: 202555,
  l2Address: l2Address,
  signatureRS: signatureRS,
  token: { mode: "mint", tick: "KAS" },
  amountDecimal: "2.0", // 2 KAS
  vaultAddress: "kaspa:qrf5mw2ru0av3dgfmkhvh0hets8k84wxcaqqr3jv9wdf6st44h0cxql4syxt8"
});

// 3. Create commit transaction on Kaspa L1
// 4. Create reveal transaction spending the commit UTXO
// 5. Wait for 5 relayers to detect and process
// 6. ERC-20 tokens will be minted to l2Address on Kasplex
```

### Data Lanes

The bridge script contains two data lanes following the [Kasplex protocol](https://docs-kasplex.gitbook.io/krc20/protocols/data-insertion-mechanism):

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
  op: "transfer",         // Operation (transfer to vault)
  tick: "KAS",            // Token ticker
  amt: "200000000",       // Amount in sompi (8 decimals) (2 KAS)
  to: "kaspa:qrf5mw2ru0av3dgfmkhvh0hets8k84wxcaqqr3jv9wdf6st44h0cxql4syxt8" // Bridge vault
}
```

## L2 → L1 Integration (Kasplex to Kaspa)

### Workflow Overview

1. **User calls burn function** on L2 bridge contract with Kaspa address
2. **ERC-20 tokens are burned** and bridge fee is paid
3. **5 relayers detect** the burn event on L2
4. **Relayers coordinate** 3-of-5 multi-sig to release KRC-20 tokens
5. **KRC-20 tokens are sent** to user's Kaspa address

### Step-by-Step Implementation

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Burn ERC-20 Tokens

```javascript
const { burnTokens } = require('./from_l2_to_l1.js');

const result = await burnTokens({
  privateKey: "0x...", // L2 private key
  tokenAddress: "0x9a5a144290dffA24C6c7Aa8cA9A62319E60973D8",
  amount: parseEther("100"), // 100 tokens
  kaspaAddress: "kaspa:qzpc2wtp5vrru728852zs567tjgghu5vrluxd2mtt9wy5tywpasz56vzfvg6m",
  burnFee: 10000000000000000000 // 10 KAS in wei
});
```

#### 3. Wait for Relayer Processing

Wait for relayer processing and KRC-20 tokens to appear on Kaspa.

### Bridge Contract Configuration

```javascript
const CONFIG = {
  CONTRACT: "0x699e7f4a64f6A5a1d7E26B05806d948338E7aDC2",
  RPC: "https://evmrpc.kasplex.org/",
  CHAIN_ID: 202555,
};
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
- `signatureRS` (string): ECDSA signature r+s (64 bytes) from EVM signing
- `token` (object): Token configuration
  - `mode` (string): "mint" for L1→L2
  - `tick` (string): Token ticker
- `amountDecimal` (string): Amount in decimal string
- `vaultAddress` (string): Kaspa vault P2SH address

**Returns:** Uint8Array script compatible with Kaspa's commit-reveal operations

**Example:**
```javascript
const script = generateBridgeScript({
  publicKey: new Uint8Array([...]), // 33-byte compressed public key
  chainId: 202555,
  l2Address: "0x742d35cc6639c2532a78444b5d4f71c8be6e5678",
  signatureRS: "0x1234...", // 64 bytes r+s from EVM signing
  token: { mode: "mint", tick: "KAS" },
  amountDecimal: "2.0",
  vaultAddress: "kaspa:qrf5mw2ru0av3dgfmkhvh0hets8k84wxcaqqr3jv9wdf6st44h0cxql4syxt8"
});
```

### burnTokens(options)
Burns ERC-20 tokens for L2→L1 operations.

**Parameters:**
- `privateKey` (string): L2 private key for signing (must start with 0x)
- `tokenAddress` (string): ERC-20 token contract address
- `amount` (BigNumber): Amount to burn in token's smallest unit
- `kaspaAddress` (string): Destination Kaspa address
- `burnFee` (number, optional): Bridge fee in wei (default: 10 KAS)

**Returns:** Transaction result object with success status and hash

**Example:**
```javascript
const result = await burnTokens({
  privateKey: "0x...", // L2 private key
  tokenAddress: "0x9a5a144290dffA24C6c7Aa8cA9A62319E60973D8",
  amount: parseEther("100"), // 100 tokens
  kaspaAddress: "kaspa:qzpc2wtp5vrru728852zs567tjgghu5vrluxd2mtt9wy5tywpasz56vzfvg6m",
  burnFee: 10000000000000000000 // 10 KAS in wei
});
```

## Troubleshooting

### Common Issues

#### L1 → L2 Bridge Issues

**Problem**: EVM message signing fails
- **Solution**: Ensure you're using the correct EIP-712 domain and types
- **Check**: Verify chain ID is 202555 and domain name is "KaspaBridge"

**Problem**: Bridge script generation fails
- **Solution**: Validate all parameters match expected formats
- **Check**: Public key must be 33 bytes, signature must be 64 bytes (r+s)
- **Check**: TokenIdHash must be valid from token-pair API

**Problem**: Tokens not appearing on L2 after deposit
- **Solution**: Wait for relayer consensus (at least 3 of 5 relayers must agree)
- **Check**: Verify deposit was sent to correct vault address and includes fee

#### L2 → L1 Bridge Issues

**Problem**: Burn transaction fails
- **Solution**: Ensure sufficient ETH for gas and bridge fee
- **Check**: Verify token address and amount are correct

**Problem**: KRC-20 tokens not received after burn
- **Solution**: Wait for multi-sig coordination (3-of-5 relayers must sign)
- **Check**: Verify Kaspa address format is correct

### Validation Checklist

#### Before L1 → L2 Deposit
- [ ] Token pair fetched from `https://api.katbridge.com/token-pair`
- [ ] EVM message signed with correct domain and types
- [ ] Bridge script generated with valid parameters
- [ ] Deposit sent to vault address: `kaspa:qrf5mw2ru0av3dgfmkhvh0hets8k84wxcaqqr3jv9wdf6st44h0cxql4syxt8`
- [ ] Fee sent to fee address: `kaspa:qypca63358auyh2hxdvnxmjleu7snzytrkgwt46a3tr6k2l8xcpvelqhygnprgs`
- [ ] Commit and reveal transactions completed

#### Before L2 → L1 Burn
- [ ] Sufficient ETH for gas fees
- [ ] Bridge fee included (10 KAS in wei)
- [ ] Valid Kaspa address format
- [ ] Correct token contract address

---

**Bridge Fee API**: `https://api.katbridge.com/bridge-fee`
**Bridge Token Pair API**: `https://api.katbridge.com/token-pair`
**L1 Bridge Vault Address**: `kaspa:qrf5mw2ru0av3dgfmkhvh0hets8k84wxcaqqr3jv9wdf6st44h0cxql4syxt8`
**L1 Bridge Fee Address**: `kaspa:qypca63358auyh2hxdvnxmjleu7snzytrkgwt46a3tr6k2l8xcpvelqhygnprgs`
**L2 Bridge Contract Address**: `0x699e7f4a64f6A5a1d7E26B05806d948338E7aDC2`
**Support**: https://discord.gg/TGA76ahDeb