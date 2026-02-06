// External dependencies
const { entropyToMnemonic, mnemonicToSeedSync, mnemonicToEntropy } = require('@scure/bip39')
const { wordlist } = require('@scure/bip39/wordlists/english')

// WDK dependencies - Direct imports (no HRPC/code generation)
const WDKModule = require('@tetherto/wdk')
const WDK = WDKModule.default || WDKModule // Handle ES module default export
const EVMWalletModule = require('@tetherto/wdk-wallet-evm')
const EVMWallet = EVMWalletModule.default || EVMWalletModule
const EVMERC4337WalletModule = require('@tetherto/wdk-wallet-evm-erc-4337')
const EVMERC4337Wallet = EVMERC4337WalletModule.default || EVMERC4337WalletModule
const SolanaWalletModule = require('@tetherto/wdk-wallet-solana')
const SolanaWallet = SolanaWalletModule.default || SolanaWalletModule

// Internal dependencies - utilities
const logger = require('./utils/logger')
const { safeStringify } = require('./utils/safe-stringify')
const { validateNonEmptyString, validateNonNegativeInteger, validateBase64, validateJSON, validateMnemonic, validateWordCount } = require('./utils/validation')
const { memzero, decrypt, generateEntropy, encryptSecrets } = require('./utils/crypto')

// Internal dependencies - exceptions
const ERROR_CODES = require('./exceptions/error-codes')
const rpcException = require('./exceptions/rpc-exception')

/**
 * Wallet managers - statically defined (no code generation)
 * Maps network names to their wallet manager implementations
 */
const walletManagers = {
  ethereum: EVMWallet,
  polygon: EVMWallet,
  arbitrum: EVMWallet,
  sepolia: EVMWallet,
  'ethereum-erc4337': EVMERC4337Wallet,
  solana: SolanaWallet
}

/**
 * Protocol managers - for future protocol support
 * Maps protocol names to their protocol manager implementations
 * Example: USDT0 bridge, swap protocols, etc.
 */
const protocolManagers = {
  // Add protocol managers here as needed
  // Example: 'USDT0': USDT0Protocol
}

/**
 * Create an error with a specific error code
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @returns {Error} Error object with code property
 */
const createErrorWithCode = (message, code) => {
  const error = new Error(message)
  error.code = code
  return error
}

/**
 * Unified validation utility that validates request object and wraps validation errors with error code
 * @param {any} request - Request to validate
 * @param {Function} validationFn - Validation function to execute
 * @param {string} fieldName - Name of the field for error messages (default: 'Request')
 * @throws {Error} With BAD_REQUEST code if validation fails
 */
const validateRequest = (request, validationFn, fieldName = 'Request') => {
  // Validate that request is a non-null object
  if (!request || typeof request !== 'object') {
    const error = new Error(`${fieldName} must be an object`)
    error.code = ERROR_CODES.BAD_REQUEST
    throw error
  }

  // Execute validation function and wrap errors with BAD_REQUEST code
  try {
    validationFn()
  } catch (error) {
    if (!error.code) {
      error.code = ERROR_CODES.BAD_REQUEST
    }
    throw error
  }
}

/**
 * Wrapper for RPC handlers that provides structured error handling
 * Preserves error codes and metadata instead of converting to plain strings
 * @param {Function} handler - The async handler function
 * @param {ERROR_CODES} [defaultErrorCode] - Optional default error code
 * @returns {Function} Wrapped handler with error handling
 */
const withErrorHandling = (handler, defaultErrorCode) => {
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      // Create structured error response
      const structuredError = rpcException.createStructuredError(error, defaultErrorCode)
      // Throw as Error with structured data in message (for RPC transport)
      // The RPC layer will handle serialization
      const errorMessage = JSON.stringify(structuredError)
      throw new Error(errorMessage)
    }
  }
}

/**
 * Generalized function to call any WDK account method
 * This provides a dev-friendly way to call account methods without needing individual handlers
 *
 * @param {Object} context - Context object containing wdk instance
 * @param {string} methodName - The method name to call on the account (e.g., 'getAddress', 'getBalance')
 * @param {string} network - Network name (e.g., 'ethereum', 'solana')
 * @param {number} accountIndex - Account index
 * @param {any} args - Arguments to pass to the method
 * @param {object} options - Optional configuration
 * @param {function} options.transformResult - Optional function to transform the result
 * @param {any} options.defaultValue - Default value to return if method doesn't exist
 * @param {string} options.protocolType - Protocol type (e.g., 'swap', 'bridge', 'lending', 'fiat')
 * @param {string} options.protocolName - Protocol name (e.g., 'USDT0')
 * @returns {Promise<any>} The result from the account method
 */
const callWdkMethod = async (context, methodName, network, accountIndex, args = null, options = {}) => {
  const { wdk } = context

  if (!wdk) {
    throw createErrorWithCode('WDK not initialized. Call initializeWDK first.', ERROR_CODES.WDK_MANAGER_INIT)
  }

  // Validate network parameter
  if (!network || typeof network !== 'string' || network.trim().length === 0) {
    throw createErrorWithCode('Network must be a non-empty string', ERROR_CODES.BAD_REQUEST)
  }

  let account
  try {
    account = await wdk.getAccount(network, accountIndex)
  } catch (error) {
    throw createErrorWithCode(
      `Failed to get account for network "${network}" at index ${accountIndex}: ${error.message}`,
      ERROR_CODES.ACCOUNT_BALANCES
    )
  }

  // Handle protocol access if specified
  switch (options?.protocolType) {
    case 'swap':
      if (!options?.protocolName) {
        throw createErrorWithCode('Protocol name is required for swap protocol', ERROR_CODES.BAD_REQUEST)
      }
      account = account.getSwapProtocol(options?.protocolName)
      break
    case 'bridge':
      if (!options?.protocolName) {
        throw createErrorWithCode('Protocol name is required for bridge protocol', ERROR_CODES.BAD_REQUEST)
      }
      account = account.getBridgeProtocol(options?.protocolName)
      break
    case 'lending':
      if (!options?.protocolName) {
        throw createErrorWithCode('Protocol name is required for lending protocol', ERROR_CODES.BAD_REQUEST)
      }
      account = account.getLendingProtocol(options?.protocolName)
      break
    case 'fiat':
      if (!options?.protocolName) {
        throw createErrorWithCode('Protocol name is required for fiat protocol', ERROR_CODES.BAD_REQUEST)
      }
      account = account.getFiatProtocol(options?.protocolName)
      break
  }

  if (typeof account[methodName] !== 'function') {
    if (options?.defaultValue !== undefined) {
      logger.warn(`${methodName} not available for network: ${network}, returning default value`)
      return options.defaultValue
    }
    const availableMethods = Object.keys(account)
      .filter(key => typeof account[key] === 'function')
      .join(', ')
    throw createErrorWithCode(
      `Method "${methodName}" not found on account for network "${network}". ` +
      `Available methods: ${availableMethods}`,
      ERROR_CODES.BAD_REQUEST
    )
  }

  const result = await account[methodName](args)

  if (options?.transformResult) {
    return options.transformResult(result)
  }

  return result
}

/**
 * Core handler functions for JSON-RPC methods
 */
const handlers = {
  /**
   * Worklet start handler
   */
  async workletStart () {
    logger.info('Worklet started')
    return { status: 'started' }
  },

  /**
   * Generate entropy and encrypt seed buffer and entropy
   */
  async generateEntropyAndEncrypt (request) {
    const { wordCount } = request

    // Validate request and word count
    validateRequest(request, () => validateWordCount(wordCount, 'wordCount'))

    // Generate entropy
    const entropy = generateEntropy(wordCount)

    // Generate mnemonic from entropy
    const mnemonic = entropyToMnemonic(entropy, wordlist)

    const seedBuffer = mnemonicToSeedSync(mnemonic)
    const entropyBuffer = Buffer.from(entropy)

    // Encrypt both secrets using the helper function
    const { encryptionKey, encryptedSeedBuffer, encryptedEntropyBuffer } = encryptSecrets(seedBuffer, entropyBuffer)

    // Zero out sensitive buffers
    memzero(entropy)
    memzero(seedBuffer)
    memzero(entropyBuffer)

    return {
      encryptionKey,
      encryptedSeedBuffer,
      encryptedEntropyBuffer
    }
  },

  /**
   * Get mnemonic phrase from encrypted entropy
   */
  async getMnemonicFromEntropy (request) {
    const { encryptedEntropy, encryptionKey } = request

    // Validate request and inputs
    validateRequest(request, () => {
      validateBase64(encryptedEntropy, 'encryptedEntropy')
      validateBase64(encryptionKey, 'encryptionKey')
    })

    // Decrypt entropy
    const entropyBuffer = decrypt(encryptedEntropy, encryptionKey)
    // Create a new Uint8Array and copy bytes explicitly for @scure/bip39 compatibility
    const entropy = new Uint8Array(entropyBuffer.length)
    entropy.set(entropyBuffer)

    // Convert entropy to mnemonic
    const mnemonic = entropyToMnemonic(entropy, wordlist)

    // Zero out sensitive buffers
    memzero(entropyBuffer)
    memzero(entropy)

    return { mnemonic }
  },

  /**
   * Convert mnemonic phrase to encrypted seed and entropy
   */
  async getSeedAndEntropyFromMnemonic (request) {
    const { mnemonic } = request

    // Validate request and mnemonic input
    validateRequest(request, () => validateMnemonic(mnemonic, 'mnemonic'))

    // Derive seed from mnemonic (used by WDK for wallet operations)
    const seed = mnemonicToSeedSync(mnemonic)
    // Extract entropy from mnemonic (original random bytes used to generate mnemonic)
    const entropy = mnemonicToEntropy(mnemonic, wordlist)

    // Encrypt both secrets and return with the encryption key
    return encryptSecrets(seed, entropy)
  },

  /**
   * Initialize WDK with encrypted seed
   */
  async initializeWDK (init, context) {
    // Validate request object (validation of fields happens below)
    if (!init || typeof init !== 'object') {
      throw createErrorWithCode('Init must be an object', ERROR_CODES.BAD_REQUEST)
    }

    if (context.wdk) {
      logger.info('Disposing existing WDK instance...')
      context.wdk.dispose()
    }

    // Validate config
    let workletConfig
    validateRequest(init, () => {
      validateNonEmptyString(init.config, 'config')
      workletConfig = validateJSON(init.config, 'config')

      // Validate encrypted seed and encryption key
      if (!init.encryptionKey || !init.encryptedSeed) {
        throw createErrorWithCode('(encryptionKey + encryptedSeed) must be provided', ERROR_CODES.BAD_REQUEST)
      }
      validateBase64(init.encryptionKey, 'encryptionKey')
      validateBase64(init.encryptedSeed, 'encryptedSeed')
    }, 'Init')

    // Validate that at least one network configuration is provided
    if (!workletConfig || !workletConfig.networks || typeof workletConfig.networks !== 'object' || Object.keys(workletConfig.networks).length === 0) {
      throw createErrorWithCode('At least one network configuration must be provided', ERROR_CODES.BAD_REQUEST)
    }

    // Initialize from encrypted seed
    logger.info('Initializing WDK with encrypted seed')
    let decryptedSeedBuffer
    try {
      decryptedSeedBuffer = decrypt(init.encryptedSeed, init.encryptionKey)
    } catch (error) {
      throw createErrorWithCode(`Failed to decrypt seed: ${error.message}`, ERROR_CODES.BAD_REQUEST)
    }

    context.wdk = new WDK(decryptedSeedBuffer)

    // Register wallets from config
    for (const [networkName, config] of Object.entries(workletConfig.networks)) {
      if (config && typeof config === 'object') {
        const walletManager = walletManagers[networkName]
        if (!walletManager) {
          throw createErrorWithCode(`No wallet manager found for network: ${networkName}`, ERROR_CODES.WDK_MANAGER_INIT)
        }

        logger.info(`Registering ${networkName} wallet`)
        context.wdk.registerWallet(networkName, walletManager, config)
      }
    }

    // Register protocols if provided
    if (workletConfig.protocols && Object.keys(workletConfig.protocols).length > 0) {
      for (const [protocolName, protocolConfig] of Object.entries(workletConfig.protocols)) {
        const protocolManager = protocolManagers[protocolName]
        if (!protocolManager) {
          throw createErrorWithCode(`No protocol manager found for protocol: ${protocolName}`, ERROR_CODES.WDK_MANAGER_INIT)
        }
        if (!walletManagers[protocolConfig.network]) {
          throw createErrorWithCode(`No wallet manager found for network: ${protocolConfig.network}`, ERROR_CODES.BAD_REQUEST)
        }
        logger.info(`Registering ${protocolName} protocol`)
        context.wdk.registerProtocol(protocolConfig.network, protocolConfig.protocolLabel, protocolManager, protocolConfig.config)
      }
    }

    logger.info('WDK initialization complete')
    return { status: 'initialized' }
  },

  /**
   * Generic handler for all WDK account methods
   */
  async callMethod (payload, context) {
    const { methodName, network, accountIndex, args: argsJson, options: optionsJson } = payload

    // Validate request and required fields
    let args, options
    validateRequest(payload, () => {
      validateNonEmptyString(methodName, 'methodName')
      validateNonEmptyString(network, 'network')
      validateNonNegativeInteger(accountIndex, 'accountIndex')

      // Parse args if provided (JSON string)
      args = argsJson ? validateJSON(argsJson, 'args') : null
      options = optionsJson ? validateJSON(optionsJson, 'options') : null
    }, 'Payload')

    // Call the method directly - no special handling
    const result = await callWdkMethod(
      context,
      methodName,
      network,
      accountIndex,
      args,
      options
    )

    // Return result directly - JSON-RPC handles serialization
    // For objects/arrays with BigInt, use safeStringify, otherwise return as-is
    if (typeof result === 'object' && result !== null) {
      return { result: JSON.parse(safeStringify(result)) }
    }
    return { result }
  },

  /**
   * Register one or more wallets to an already initialized WDK instance
   */
  async registerWallet (request, context) {
    const { config: configJson } = request

    // Validate request and required fields
    let workletConfig
    validateRequest(request, () => {
      validateNonEmptyString(configJson, 'config')
      workletConfig = validateJSON(configJson, 'config')
    }, 'RegisterWalletRequest')

    if (!workletConfig || typeof workletConfig !== 'object' || !workletConfig.networks || typeof workletConfig.networks !== 'object') {
      throw createErrorWithCode('config must be an object with network configurations', ERROR_CODES.BAD_REQUEST)
    }

    const { networks } = workletConfig

    // Check if WDK is initialized
    if (!context.wdk) {
      throw createErrorWithCode('WDK not initialized. Call initializeWDK first.', ERROR_CODES.WDK_MANAGER_INIT)
    }

    // Register each wallet from the config
    const registeredBlockchains = []
    for (const [networkName, config] of Object.entries(networks)) {
      if (config && typeof config === 'object') {
        // Check if wallet manager exists for this blockchain
        const walletManager = walletManagers[networkName]
        if (!walletManager) {
          throw createErrorWithCode(`No wallet manager found for blockchain: ${networkName}`, ERROR_CODES.BAD_REQUEST)
        }

        // Register the wallet
        logger.info(`Registering ${networkName} wallet dynamically`)
        context.wdk.registerWallet(networkName, walletManager, config)
        registeredBlockchains.push(networkName)
      }
    }

    if (registeredBlockchains.length === 0) {
      throw createErrorWithCode('no valid network configurations provided', ERROR_CODES.BAD_REQUEST)
    }

    return { status: 'registered', blockchains: JSON.stringify(registeredBlockchains) }
  },

  /**
   * Register one or more protocols to an already initialized WDK instance
   */
  async registerProtocol (request, context) {
    const { config: workletConfig } = request
    const { protocols } = validateJSON(workletConfig, 'config')

    // Validate that WDK is initialized
    if (!context.wdk) {
      throw createErrorWithCode('WDK not initialized. Call initializeWDK first.', ERROR_CODES.WDK_MANAGER_INIT)
    }

    for (const [protocolName, protocolConfig] of Object.entries(protocols)) {
      if (protocolConfig && typeof protocolConfig === 'object') {
        const protocolManager = protocolManagers[protocolName]
        if (!protocolManager) {
          throw createErrorWithCode(`No protocol manager found for protocol: ${protocolName}`, ERROR_CODES.BAD_REQUEST)
        }
        if (!walletManagers[protocolConfig.network]) {
          throw createErrorWithCode(`No wallet manager found for network: ${protocolConfig.network}`, ERROR_CODES.BAD_REQUEST)
        }
        logger.info(`Registering ${protocolName} protocol - with label: ${protocolConfig.protocolLabel}`)
        context.wdk.registerProtocol(protocolConfig.network, protocolConfig.protocolLabel, protocolManager, protocolConfig.config)
      }
    }
    return { status: 'registered' }
  },

  /**
   * Dispose WDK instance
   */
  async dispose (context) {
    if (context.wdk) {
      logger.info('Disposing WDK instance')
      context.wdk.dispose()
      context.wdk = null
    }
    return { status: 'disposed' }
  }
}

module.exports = {
  handlers,
  withErrorHandling,
  walletManagers,
  protocolManagers
}
