/**
 * Test that imports work correctly (without running handlers)
 * This can run in Node.js
 */

console.log('🧪 Testing imports...\n')

try {
  console.log('1. Importing handlers module...')
  const handlers = require('../src/handlers')
  console.log('   ✅ Handlers module imported successfully')
  
  console.log('\n2. Checking exported handlers...')
  const handlerNames = Object.keys(handlers)
  console.log('   Available handlers:', handlerNames.join(', '))
  console.log('   ✅ Found', handlerNames.length, 'handlers')
  
  console.log('\n3. Verifying handler functions...')
  for (const [name, handler] of Object.entries(handlers)) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler ${name} is not a function!`)
    }
  }
  console.log('   ✅ All handlers are functions')

  console.log('\n4. Importing rpc-handlers module...')
  const { registerJsonRpcHandlers, withErrorHandling } = require('../src/rpc-handlers')
  if (typeof registerJsonRpcHandlers !== 'function') {
    throw new Error('registerJsonRpcHandlers is not a function!')
  }
  if (typeof withErrorHandling !== 'function') {
    throw new Error('withErrorHandling is not a function!')
  }
  console.log('   ✅ rpc-handlers module imported successfully')

  console.log('\n5. Importing utils...')
  const validation = require('../src/utils/validation')
  if (typeof validation.createErrorWithCode !== 'function') {
    throw new Error('createErrorWithCode not found in validation!')
  }
  if (typeof validation.validateRequest !== 'function') {
    throw new Error('validateRequest not found in validation!')
  }
  console.log('   ✅ validation.js has createErrorWithCode + validateRequest')
  
  const errorCodes = require('../src/exceptions/error-codes')
  if (!errorCodes.INTERNAL_ERROR) {
    throw new Error('INTERNAL_ERROR not found in error-codes!')
  }
  console.log('   ✅ error-codes.js has INTERNAL_ERROR')
  
  console.log('\n✅ All import tests passed!')
  console.log('\nNote: Full handler tests require Bare runtime (run in iOS app)')
  
} catch (error) {
  console.error('\n❌ Import test failed:', error.message)
  console.error('Stack:', error.stack)
  process.exit(1)
}
