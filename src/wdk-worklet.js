console.log('wdk-worklet.js - JSON-RPC only version')

// Internal dependencies
const logger = require('./utils/logger')
const { handlers, withErrorHandling } = require('./rpc-handlers')

// Handle unhandled promise rejections and exceptions
if (typeof process !== 'undefined' && process.on) {
  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection in worklet:', error)
  })
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception in worklet:', error)
  })
}

// Initialize BareKit IPC
// eslint-disable-next-line no-undef
const { IPC: BareIPC } = BareKit
logger.info('BareKit IPC initialized')

// State - this will be managed by the RPC handlers
let wdk = null

// Create context object for RPC handlers
// This allows handlers to read and update the wdk state
const context = {
  get wdk () {
    return wdk
  },
  set wdk (value) {
    wdk = value
  }
}

// === Length-Prefixed Framing ===
// Buffer for accumulating incoming data
let readBuffer = Buffer.alloc(0)

/**
 * Write a framed message: [4-byte length][message]
 */
function writeFramed (data) {
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(data.length, 0)
  BareIPC.write(Buffer.concat([length, data]))
}

/**
 * Process incoming data with framing
 * Accumulates data in buffer and extracts complete messages
 */
function processFramedData (chunk) {
  // Append new data to buffer
  readBuffer = Buffer.concat([readBuffer, chunk])

  // Try to extract complete messages
  while (readBuffer.length >= 4) {
    // Read message length from first 4 bytes
    const messageLength = readBuffer.readUInt32BE(0)

    // Check if we have the complete message
    const totalLength = 4 + messageLength
    if (readBuffer.length < totalLength) {
      // Not enough data yet, wait for more
      break
    }

    // Extract the message
    const messageData = readBuffer.slice(4, totalLength)
    readBuffer = readBuffer.slice(totalLength)

    // Process the complete message
    try {
      const message = JSON.parse(messageData.toString())

      // Only handle if it's a JSON-RPC message (has 'jsonrpc' field)
      if (message.jsonrpc === '2.0') {
        handleJsonRpcMessage(message, context)
      }
    } catch (e) {
      logger.error('Failed to parse framed message:', e)
    }
  }
}

// Listen for incoming data chunks
BareIPC.on('data', (data) => {
  processFramedData(data)
})

/**
 * Handle incoming JSON-RPC 2.0 messages
 * @param {Object} message - The JSON-RPC message
 * @param {Object} context - The context object with wdk state
 */
async function handleJsonRpcMessage (message, context) {
  const { id, method, params } = message

  try {
    let result
    logger.info(`JSON-RPC request: ${method}`, params)

    // Map JSON-RPC methods to handler functions
    switch (method) {
      case 'workletStart':
        result = await withErrorHandling(handlers.workletStart)()
        break

      case 'generateEntropyAndEncrypt':
        result = await withErrorHandling(handlers.generateEntropyAndEncrypt)(params)
        break

      case 'getMnemonicFromEntropy':
        result = await withErrorHandling(handlers.getMnemonicFromEntropy)(params)
        break

      case 'getSeedAndEntropyFromMnemonic':
        result = await withErrorHandling(handlers.getSeedAndEntropyFromMnemonic)(params)
        break

      case 'initializeWDK':
        result = await withErrorHandling(handlers.initializeWDK)(params, context)
        break

      case 'callMethod':
        result = await withErrorHandling(handlers.callMethod)(params, context)
        break

      case 'registerWallet':
        result = await withErrorHandling(handlers.registerWallet)(params, context)
        break

      case 'registerProtocol':
        result = await withErrorHandling(handlers.registerProtocol)(params, context)
        break

      case 'dispose':
        result = await withErrorHandling(handlers.dispose)(context)
        break

      default:
        throw new Error(`Unknown method: ${method}`)
    }

    logger.info(`JSON-RPC response: ${method}`, result)

    // Send success response with framing
    const response = JSON.stringify({
      jsonrpc: '2.0',
      id,
      result
    })
    writeFramed(Buffer.from(response))
  } catch (error) {
    logger.error(`JSON-RPC error: ${method}`, error)

    // Try to parse structured error if it exists (from withErrorHandling)
    let errorResponse
    try {
      const structuredError = JSON.parse(error.message)
      errorResponse = {
        message: structuredError.message,
        code: structuredError.code,
        data: structuredError.data
      }
    } catch (e) {
      // Not a structured error, use plain error
      errorResponse = {
        message: error.message || String(error),
        code: error.code || 'INTERNAL_ERROR'
      }
    }

    // Send error response with framing
    const response = JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: errorResponse
    })
    writeFramed(Buffer.from(response))
  }
}

logger.info('WDK Worklet ready - listening for JSON-RPC messages')
