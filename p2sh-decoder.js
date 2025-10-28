const wasm = require('./kaspa-wasm32-sdk/nodejs/kaspa');

// Network type definition
const Network = {
  MAINNET: 'mainnet',
};

function p2shAddressFromRedeem(redeem, network) {
  if (redeem.length === 0) throw new Error("redeem is empty");
  if (redeem.length > 520) throw new Error("redeem exceeds 520-byte limit");
  // WASM functions throw on error, not return undefined
  let spk;
  try {
    spk = wasm.payToScriptHashScript(redeem);
  } catch (e) {
    // Try as hex string if Uint8Array failed
    try {
      const hexString = Array.from(redeem).map(b => b.toString(16).padStart(2, '0')).join('');
      spk = wasm.payToScriptHashScript(hexString);
    } catch (e2) {
      throw new Error(`payToScriptHashScript failed with both Uint8Array and hex string: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  
  const addr = wasm.addressFromScriptPublicKey(spk, network);
  if (!addr) throw new Error("failed to derive P2SH address from script public key");
  return String(addr);
}

// Helper function to convert hex string to Uint8Array
function redeemScriptFromHex(hexString) {
  return new Uint8Array(
    hexString.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
  );
}


(() => {
  const redeemScript = redeemScriptFromHex('2083853961a3063e79473d1428535e5c908bf28c1ff866ab6b595c4a2c8e0f602aac0063076b6173706c6578514c68b9000461760161631a0003173b616c54aef33e76972c08b8ac19221cb6e7d2fa4054af43617358409481683c8ac8fdb10937580aeb834ed941914263a8027bdc57314ac71529c4785ee54f875528c620373bfd190aedb8c25c36e9c9641fca4927e675f38272aa74004c897b2270223a226b72632d3230222c226f70223a227472616e73666572222c22616d74223a22313030303030303030222c22746f223a226b617370613a717266356d77327275306176336467666d6b6876683068657473386b383477786361717172336a7639776466367374343468306378716c347379787438222c227469636b223a225a45414c227d68');
  const network = Network.MAINNET;
  const p2shAddress = p2shAddressFromRedeem(redeemScript, network);
  console.log('p2shAddress:', p2shAddress);
})();