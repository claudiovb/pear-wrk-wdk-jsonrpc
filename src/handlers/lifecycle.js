'use strict'

const ERROR_CODES = require('../exceptions/error-codes')
const { decrypt } = require('../utils/crypto')
const logger = require('../utils/logger')
const {
  validateBase64,
  validateJSON,
  validateNonEmptyString,
  validateRequest,
  createErrorWithCode
} = require('../utils/validation')

/**
 * @param {Object} init
 * @param {Object} context
 * @returns {Promise<{ status: string }>}
 */
async function initializeWdkHandler (init, context) {
  const { WDK, walletManagers, protocolManagers, wdkLoadError } = context

  if (!init || typeof init !== 'object') {
    throw createErrorWithCode('Init must be an object', ERROR_CODES.BAD_REQUEST)
  }

  if (!WDK) {
    const errorMsg = wdkLoadError
      ? `WDK failed to load: ${wdkLoadError.message}`
      : 'WDK not loaded - unknown error during initialization'
    throw createErrorWithCode(errorMsg, ERROR_CODES.WDK_MANAGER_INIT)
  }

  if (context.wdk) {
    logger.info('Disposing existing WDK instance...')
    context.wdk.dispose()
  }

  let workletConfig
  validateRequest(
    init,
    () => {
      validateNonEmptyString(init.config, 'config')
      workletConfig = validateJSON(init.config, 'config')

      if (!init.encryptionKey || !init.encryptedSeed) {
        throw createErrorWithCode(
          '(encryptionKey + encryptedSeed) must be provided',
          ERROR_CODES.BAD_REQUEST
        )
      }
      validateBase64(init.encryptionKey, 'encryptionKey')
      validateBase64(init.encryptedSeed, 'encryptedSeed')
    },
    'Init'
  )

  if (
    !workletConfig ||
    !workletConfig.networks ||
    typeof workletConfig.networks !== 'object' ||
    Object.keys(workletConfig.networks).length === 0
  ) {
    throw createErrorWithCode(
      'At least one network configuration must be provided',
      ERROR_CODES.BAD_REQUEST
    )
  }

  logger.info('Initializing WDK with encrypted seed')
  let decryptedSeedBuffer
  try {
    decryptedSeedBuffer = decrypt(init.encryptedSeed, init.encryptionKey)
  } catch (error) {
    throw createErrorWithCode(
      `Failed to decrypt seed: ${error.message}`,
      ERROR_CODES.BAD_REQUEST
    )
  }

  context.wdk = new WDK(decryptedSeedBuffer)

  for (const networkConfig of Object.values(workletConfig.networks)) {
    const networkName = networkConfig.blockchain

    if (networkConfig.config && typeof networkConfig.config === 'object') {
      const walletManager = walletManagers[networkName]

      if (!walletManager) {
        throw createErrorWithCode(
          `No wallet manager found for network: ${networkName}`,
          ERROR_CODES.WDK_MANAGER_INIT
        )
      }

      logger.info(`Registering ${networkName} wallet`)
      context.wdk.registerWallet(networkName, walletManager, networkConfig.config)
    }
  }

  if (
    workletConfig.protocols &&
    Object.keys(workletConfig.protocols).length > 0
  ) {
    for (const protocolConfig of Object.values(workletConfig.protocols)) {
      const protocolName = protocolConfig.protocolName
      const protocolManager = protocolManagers[protocolName]

      if (!protocolManager) {
        throw createErrorWithCode(
          `No protocol manager found for protocol: ${protocolName}`,
          ERROR_CODES.WDK_MANAGER_INIT
        )
      }

      if (!walletManagers[protocolConfig.blockchain]) {
        throw createErrorWithCode(
          `No wallet manager found for network: ${protocolConfig.blockchain}`,
          ERROR_CODES.BAD_REQUEST
        )
      }

      logger.info(`Registering ${protocolName} protocol`)
      context.wdk.registerProtocol(
        protocolConfig.blockchain,
        protocolName,
        protocolManager,
        protocolConfig.config
      )
    }
  }

  logger.info('WDK initialization complete')
  return { status: 'initialized' }
}

/**
 * @param {any} request
 * @param {Object} context
 * @returns {Promise<{ status: string }>}
 */
async function disposeWdkHandler (request, context) {
  if (context.wdk) {
    logger.info('Disposing WDK instance')
    context.wdk.dispose()
    context.wdk = null
  }
  return { status: 'disposed' }
}

module.exports = {
  initializeWdkHandler,
  disposeWdkHandler
}
