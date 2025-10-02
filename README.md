# Kaspa Bridge Script Generator & Parser

Tools for encoding and decoding Kaspa Bridge commit-reveal transactions with KRC-20 token transfers, plus EVM contract interaction scripts.

## Quick Start

```bash
# Install dependencies
npm install

# Generate a bridge script
npm run start

# Test the burnForBridgeBack function
npm run burn

# Parse a signature script
npm run parse -- --script <hex>
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

## EVM Contract Interaction

### burnForBridgeBack Function

**Purpose**: Bridge tokens from Kasplex (L2) back to Kaspa (L1) by burning ERC-20 tokens.

**What you need**: 
- A wallet with KAS for gas fees
- ERC-20 tokens on Kasplex to burn
- A Kaspa address to receive the KRC-20 tokens

**What it does**: Burns your ERC-20 tokens and initiates the bridge process that will send KRC-20 tokens to your Kaspa wallet.

#### 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Edit the script:**
   - Open `burn-bridge-back.js`
   - Find the `testParams` object (around line 194)
   - Replace the `privateKey` with your actual private key
   - Update `tokenAddress` with the ERC-20 token contract address
   - Update `kaspaAddress` with your destination Kaspa address

3. **Run the script:**
   ```bash
   npm run burn
   ```

#### Function Signature
```solidity
function burnForBridgeBack(
    address _token,        // ERC-20 token contract address
    uint256 _amount,       // Amount of tokens to burn (in token's smallest unit)
    string _kaspaAddress   // Kaspa address to receive the tokens
) external payable
```

#### Usage in Code

```javascript
const { burnTokens } = require('./burn-bridge-back.js');

// Execute burn transaction
const result = await burnTokens({
  privateKey: "0x...",                    // Your private key
  tokenAddress: "0x...",                  // ERC-20 token address
  amount: parseEther("100"),              // Amount to burn (100 tokens)
  kaspaAddress: "kaspa:...",              // Destination Kaspa address
  burnFee: "0x" + parseEther("10").toString(16)  // Optional: burn fee in hex (10 KAS)
});
```

#### Configuration

The script is pre-configured for Kasplex production:

```javascript
// Kasplex Production Configuration
const CONFIG = {
  CONTRACT: "0x699e7f4a64f6A5a1d7E26B05806d948338E7aDC2",
  RPC: "https://evmrpc.kasplex.org/",
  CHAIN_ID: 202555,
  BURN_FEE: "0x2540be400" // 10 KAS in hex
};
```

**No environment variables needed** - just update the `privateKey` in the test function or pass it directly to `burnTokens()`.

#### Script Features

- **Gas Estimation**: Automatically estimates gas for the transaction
- **Error Handling**: Comprehensive error handling and logging
- **Transaction Confirmation**: Waits for transaction confirmation
- **Function Data Encoding**: Encodes function calls using viem
- **Pre-configured**: Ready to use with Kasplex production network

#### Example Output

```
🔥 Initializing burnForBridgeBack transaction...
Token Address: 0x1234567890123456789012345678901234567890
Amount: 100000000000000000000
Kaspa Address: kaspa:qryv8wv2g9y5mz6k8r7n4t3x1c2v5b6n9m0p1q2w3e4r5t6y7u8i9o0p
Burn Fee: 0.001 KAS
Account Address: 0x...
Function Data: 0x...
Gas Estimate: 150000
Gas Price: 0.00000002 KAS
✅ Transaction submitted!
Transaction Hash: 0x...
⏳ Waiting for confirmation...
✅ Transaction confirmed!
Block Number: 12345678
Gas Used: 145000
Status: SUCCESS
```

#### What This Script Does

This script allows you to **bridge tokens back from Kasplex (L2) to Kaspa (L1)**:

1. **Burns ERC-20 tokens** on the Kasplex network
2. **Pays a small KAS fee** for the bridge operation
3. **Initiates the bridge process** that will eventually send KRC-20 tokens to your Kaspa address

#### Bridge-Back Flow

Here's how the complete bridge-back process works:

1. **🔥 Burn Tokens**: This script burns your ERC-20 tokens on Kasplex
2. **👀 Relayers Detect**: Bridge relayers detect the burn event
3. **📝 Create KRC-20**: Relayers create a KRC-20 transfer on Kaspa
4. **✅ Complete**: You receive KRC-20 tokens in your Kaspa wallet

**Note**: The actual KRC-20 transfer happens automatically after the burn - you don't need to do anything else!

#### 🔧 Troubleshooting

**Common Issues:**

1. **"Please update testParams with your actual private key"**
   - Solution: Edit the `privateKey` field in the `testParams` object in `burn-bridge-back.js`

2. **"Insufficient funds"**
   - Solution: Make sure you have enough KAS for gas fees and the burn fee

3. **"Token address not found"**
   - Solution: Verify the token contract address is correct and the token exists on Kasplex

4. **"Invalid Kaspa address"**
   - Solution: Make sure the Kaspa address is properly formatted (starts with `kaspa:`)

**Getting Help:**
- Check the Kasplex Explorer: https://explorer.kasplex.org/
- Verify your transaction was successful
- Contact support if the KRC-20 tokens don't appear after 10-15 minutes

----------------------------