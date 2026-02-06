/**
 * Test that imports work correctly (without running handlers)
 * This can run in Node.js
 */

console.log('🧪 Testing imports from rpc-handlers...\n')

try {
  console.log('1. Importing rpc-handlers module...')
  const { handlers, walletManagers } = require('../src/rpc-handlers')
  console.log('   ✅ Module imported successfully')
  
  console.log('\n2. Checking exported handlers...')
  const handlerNames = Object.keys(handlers)
  console.log('   Available handlers:', handlerNames.join(', '))
  console.log('   ✅ Found', handlerNames.length, 'handlers')
  
  console.log('\n3. Checking wallet managers...')
  const walletNames = Object.keys(walletManagers)
  console.log('   Available wallets:', walletNames.join(', '))
  console.log('   ✅ Found', walletNames.length, 'wallet managers')
  
  console.log('\n4. Verifying handler functions...')
  for (const [name, handler] of Object.entries(handlers)) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler ${name} is not a function!`)
    }
  }
  console.log('   ✅ All handlers are functions')
  
  console.log('\n✅ All import tests passed!')
  console.log('\nNote: Full handler tests require Bare runtime (run in iOS app)')
  
} catch (error) {
  console.error('\n❌ Import test failed:', error.message)
  console.error('Stack:', error.stack)
  process.exit(1)
}
