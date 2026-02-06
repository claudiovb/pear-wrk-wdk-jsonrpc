/**
 * Test RPC handlers
 */

const { handlers } = require('../src/rpc-handlers')

console.log('🧪 Testing RPC handlers...\n')

async function runTests() {
  try {
    // Test 1: Generate entropy
    console.log('1. Testing generateEntropyAndEncrypt...')
    const entropyResult = await handlers.generateEntropyAndEncrypt({ wordCount: 12 })
    console.log('   ✅ Generated encryption key:', entropyResult.encryptionKey.substring(0, 20) + '...')
    console.log('   ✅ Has encrypted seed:', !!entropyResult.encryptedSeedBuffer)
    console.log('   ✅ Has encrypted entropy:', !!entropyResult.encryptedEntropyBuffer)
    
    // Test 2: Get mnemonic from entropy
    console.log('\n2. Testing getMnemonicFromEntropy...')
    const mnemonicResult = await handlers.getMnemonicFromEntropy({
      encryptedEntropy: entropyResult.encryptedEntropyBuffer,
      encryptionKey: entropyResult.encryptionKey
    })
    console.log('   ✅ Mnemonic:', mnemonicResult.mnemonic)
    
    // Test 3: Convert mnemonic to seed
    console.log('\n3. Testing getSeedAndEntropyFromMnemonic...')
    const seedResult = await handlers.getSeedAndEntropyFromMnemonic({
      mnemonic: mnemonicResult.mnemonic
    })
    console.log('   ✅ Generated encryption key:', seedResult.encryptionKey.substring(0, 20) + '...')
    
    // Test 4: Initialize WDK
    console.log('\n4. Testing initializeWDK...')
    const context = {
      wdk: null
    }
    
    const config = JSON.stringify({
      networks: {
        ethereum: {
          chainId: 1,
          blockchain: 'ethereum',
          provider: 'https://rpc.mevblocker.io/fast',
          transferMaxFee: 100000
        }
      }
    })
    
    const initResult = await handlers.initializeWDK({
      encryptionKey: seedResult.encryptionKey,
      encryptedSeed: seedResult.encryptedSeedBuffer,
      config: config
    }, context)
    
    console.log('   ✅ WDK initialized:', initResult.status)
    console.log('   ✅ WDK instance exists:', !!context.wdk)
    
    // Test 5: Get address
    console.log('\n5. Testing callMethod (getAddress)...')
    const addressResult = await handlers.callMethod({
      methodName: 'getAddress',
      network: 'ethereum',
      accountIndex: 0
    }, context)
    
    // Result is returned directly now (not as JSON string)
    const address = addressResult.result
    console.log('   ✅ Ethereum address:', address)
    
    // Test 6: Dispose
    console.log('\n6. Testing dispose...')
    await handlers.dispose(context)
    console.log('   ✅ WDK disposed')
    
    console.log('\n✅ All handler tests passed!')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

runTests()
