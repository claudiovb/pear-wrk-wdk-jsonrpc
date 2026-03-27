/**
 * Test RPC handlers
 * Must be run with Bare runtime: bare test/test-handlers.js
 */

require('bare-node-runtime/global')

const {
  generateEntropyAndEncryptHandler,
  getMnemonicFromEntropyHandler,
  getSeedAndEntropyFromMnemonicHandler,
  initializeWdkHandler,
  callMethodHandler,
  disposeWdkHandler
} = require('../src/handlers')

const WDKModule = require('@tetherto/wdk')
const WDK = WDKModule.default || WDKModule

console.log('🧪 Testing RPC handlers...\n')

async function runTests() {
  try {
    // Test 1: Generate entropy
    console.log('1. Testing generateEntropyAndEncrypt...')
    const entropyResult = await generateEntropyAndEncryptHandler({ wordCount: 12 })
    console.log('   ✅ Generated encryption key:', entropyResult.encryptionKey.substring(0, 20) + '...')
    console.log('   ✅ Has encrypted seed:', !!entropyResult.encryptedSeedBuffer)
    console.log('   ✅ Has encrypted entropy:', !!entropyResult.encryptedEntropyBuffer)
    
    // Test 2: Get mnemonic from entropy
    console.log('\n2. Testing getMnemonicFromEntropy...')
    const mnemonicResult = await getMnemonicFromEntropyHandler({
      encryptedEntropy: entropyResult.encryptedEntropyBuffer,
      encryptionKey: entropyResult.encryptionKey
    })
    console.log('   ✅ Mnemonic:', mnemonicResult.mnemonic)
    
    // Test 3: Convert mnemonic to seed
    console.log('\n3. Testing getSeedAndEntropyFromMnemonic...')
    const seedResult = await getSeedAndEntropyFromMnemonicHandler({
      mnemonic: mnemonicResult.mnemonic
    })
    console.log('   ✅ Generated encryption key:', seedResult.encryptionKey.substring(0, 20) + '...')
    
    // Test 4: Initialize WDK (HRPC config format: blockchain + config nesting)
    console.log('\n4. Testing initializeWDK...')

    const WdkWalletEvm = require('@tetherto/wdk-wallet-evm')
    const walletManagers = {
      ethereum: WdkWalletEvm.default || WdkWalletEvm
    }

    const context = {
      wdk: null,
      WDK,
      walletManagers,
      protocolManagers: {}
    }
    
    const config = JSON.stringify({
      networks: {
        eth_mainnet: {
          blockchain: 'ethereum',
          config: {
            chainId: 1,
            provider: 'https://rpc.mevblocker.io/fast',
            transferMaxFee: 100000
          }
        }
      }
    })
    
    const initResult = await initializeWdkHandler({
      encryptionKey: seedResult.encryptionKey,
      encryptedSeed: seedResult.encryptedSeedBuffer,
      config: config
    }, context)
    
    console.log('   ✅ WDK initialized:', initResult.status)
    console.log('   ✅ WDK instance exists:', !!context.wdk)
    
    // Test 5: Get address
    console.log('\n5. Testing callMethod (getAddress)...')
    const addressResult = await callMethodHandler({
      methodName: 'getAddress',
      network: 'ethereum',
      accountIndex: 0
    }, context)
    
    const address = JSON.parse(addressResult.result)
    console.log('   ✅ Ethereum address:', address)
    
    // Test 6: Dispose
    console.log('\n6. Testing dispose...')
    await disposeWdkHandler(null, context)
    console.log('   ✅ WDK disposed')
    
    console.log('\n✅ All handler tests passed!')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

runTests()
