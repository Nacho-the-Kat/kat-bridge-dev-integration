// === Kasplex Bridge Burn Script ===
const { createPublicClient, createWalletClient, http, parseEther, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

// Bridge ABI
const bridgeAbi = [{
  "inputs": [
    {"internalType": "address", "name": "_token", "type": "address"},
    {"internalType": "uint256", "name": "_amount", "type": "uint256"},
    {"internalType": "string", "name": "_kaspaAddress", "type": "string"}
  ],
  "name": "burnForBridgeBack",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
}];

// Kasplex Production Config
const CONFIG = {
  CONTRACT: "0x699e7f4a64f6A5a1d7E26B05806d948338E7aDC2", // Kasplex Mainnet Bridge Contract Address
  RPC: "https://evmrpc.kasplex.org/",
  CHAIN_ID: 202555,
  BURN_FEE: 10000000000000000000 // 10 KAS in wei
};

// Create viem clients
function createClients(privateKey) {
  const account = privateKeyToAccount(privateKey);
  const chain = {
    id: CONFIG.CHAIN_ID,
    name: 'Kasplex Mainnet',
    nativeCurrency: { name: 'Kaspa', symbol: 'KAS', decimals: 18 },
    rpcUrls: { default: { http: [CONFIG.RPC] } },
    blockExplorers: { default: { name: 'Kasplex Explorer', url: 'https://explorer.kasplex.org' } }
  };

  return {
    publicClient: createPublicClient({ chain, transport: http(CONFIG.RPC) }),
    walletClient: createWalletClient({ account, chain, transport: http(CONFIG.RPC) }),
    account
  };
}

// Execute burn transaction
async function burnTokens({ privateKey, tokenAddress, amount, kaspaAddress, burnFee = CONFIG.BURN_FEE }) {
  try {
    console.log('🔥 Burning tokens for bridge-back...');
    console.log(`Token: ${tokenAddress}`);
    console.log(`Amount: ${amount}`);
    console.log(`To Kaspa: ${kaspaAddress}`);
    console.log(`Burn Fee: ${burnFee}`);

    const { publicClient, walletClient, account } = createClients(privateKey);
    console.log(`From: ${account.address}`);

    // Get gas estimate
    const gasEstimate = await publicClient.estimateContractGas({
      address: CONFIG.CONTRACT,
      abi: bridgeAbi,
      functionName: 'burnForBridgeBack',
      args: [tokenAddress, amount, kaspaAddress],
      account: account.address,
      value: BigInt(burnFee)
    });

    // Execute transaction
    const hash = await walletClient.writeContract({
      address: CONFIG.CONTRACT,
      abi: bridgeAbi,
      functionName: 'burnForBridgeBack',
      args: [tokenAddress, amount, kaspaAddress],
      value: BigInt(burnFee),
      gas: gasEstimate
    });

    console.log('✅ Transaction submitted:', hash);
    console.log('⏳ Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('✅ Confirmed! Block:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());

    return { success: true, hash, receipt };

  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

// Test function
async function test() {
  console.log('🧪 Testing burn script...\n');

  const params = {
    privateKey: "0x...", // ← Replace with your private key, should start with 0x prefix
    tokenAddress: "0x9a5a144290dffA24C6c7Aa8cA9A62319E60973D8", // ← Replace with token address
    amount: parseEther("1"), // 1 token
    kaspaAddress: "kaspa:qzpc2wtp5vrru728852zs567tjgghu5vrluxd2mtt9wy5tywpasz56vzfvg6m", // ← Replace with Kaspa address
    burnFee: 10000000000000000000 // 10 KAS fee in wei  
  };

  const result = await burnTokens(params);
  console.log(result.success ? '🎉 Success!' : '💥 Failed:', result.error || result.hash);
}

// Export
module.exports = { burnTokens, CONFIG };

// Run test if executed directly
if (require.main === module) {
  test().catch(console.error);
}
