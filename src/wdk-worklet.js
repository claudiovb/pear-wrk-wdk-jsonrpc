console.log('wdk-worklet.js - JSON-RPC only version')

// Polyfills for JSC (TextEncoder, process, etc.) - must be first
require('bare-node-runtime/global')

// Force .mjs files to load as CJS (JSC has no js_create_module)
if (Bare.platform === 'ios' || Bare.platform === 'darwin') {
  module.constructor._extensions['.mjs'] = module.constructor._extensions['.js']
}

const logger = require('./utils/logger')
const { registerJsonRpcHandlers } = require('./rpc-handlers')

// Catch termination signal from BareKit (when Swift calls worklet.terminate())
// Without this, Bare's default handler calls C abort(), killing the host app.
Bare.on('uncaughtException', (err) => {
  logger.error('Caught exception in worklet:', err)
})

Bare.on('exit', () => {
  if (context.wdk) {
    try { context.wdk.dispose() } catch (e) {}
    context.wdk = null
  }
})

if (typeof process !== 'undefined' && process.on) {
  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection in worklet:', error)
  })
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception in worklet:', error)
  })
}

// === WDK + Wallet Manager Setup ===

let WDK = null
let wdkLoadError = null
try {
  const WDKModule = require('@tetherto/wdk')
  WDK = WDKModule.default || WDKModule
} catch (err) {
  wdkLoadError = err
  logger.error('Failed to load WDK module:', err)
}

/**
 * Wallet managers - lazy loaded to avoid loading 2000+ modules at startup.
 * Heavy wallet SDKs (ethers, viem, solana) are only required when
 * initializeWDK is called, not when the worklet starts.
 */
const _walletModuleCache = {}

function getWalletManager (network) {
  if (_walletModuleCache[network]) return _walletModuleCache[network]

  let mod
  if (network === 'ethereum') {
    mod = require('@tetherto/wdk-wallet-evm')
  } else if (network === 'ethereum-erc4337') {
    mod = require('@tetherto/wdk-wallet-evm-erc-4337')
  } else if (network === 'solana') {
    mod = require('@tetherto/wdk-wallet-solana')
  } else if (network === 'bitcoin') {
    mod = require('@tetherto/wdk-wallet-btc')
  } else {
    return null
  }

  _walletModuleCache[network] = mod.default || mod
  return _walletModuleCache[network]
}

const walletManagers = new Proxy({}, {
  get: (_, network) => getWalletManager(network),
  has: (_, network) => ['ethereum', 'ethereum-erc4337', 'solana', 'bitcoin'].includes(network)
})

const protocolManagers = {}

// === Context (passed to all handlers) ===

let wdk = null

const context = {
  WDK,
  walletManagers,
  protocolManagers,
  wdkLoadError,
  get wdk () {
    return wdk
  },
  set wdk (value) {
    wdk = value
  }
}

// === Initialize BareKit IPC and register handlers ===

// eslint-disable-next-line no-undef
const { IPC: BareIPC } = BareKit
logger.info('BareKit IPC initialized')

registerJsonRpcHandlers(BareIPC, context)

logger.info('WDK Worklet ready - listening for JSON-RPC messages')
