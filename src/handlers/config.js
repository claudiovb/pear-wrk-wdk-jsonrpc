'use strict'

const ERROR_CODES = require('../exceptions/error-codes')
const logger = require('../utils/logger')
const {
  validateNonEmptyString,
  validateJSON,
  createErrorWithCode,
  validateRequest
} = require('../utils/validation')

/**
 * @param {{ config: string }} request
 * @param {Object} context
 * @returns {Promise<{ status: string, blockchains: string }>}
 */
async function registerWalletHandler (request, context) {
  const { config: configJson } = request
  const { walletManagers, wdk } = context

  let networkConfigs
  validateRequest(
    request,
    () => {
      validateNonEmptyString(configJson, 'config')
      networkConfigs = validateJSON(configJson, 'config')
    },
    'RegisterWalletRequest'
  )

  if (
    !networkConfigs ||
    typeof networkConfigs !== 'object'
  ) {
    throw createErrorWithCode(
      'Config must be an network configurations object',
      ERROR_CODES.BAD_REQUEST
    )
  }

  if (!wdk) {
    throw createErrorWithCode(
      'WDK not initialized. Call initializeWDK first.',
      ERROR_CODES.WDK_MANAGER_INIT
    )
  }

  const registeredBlockchains = []
  for (const networkConfig of Object.values(networkConfigs)) {
    const networkName = networkConfig.blockchain

    if (networkConfig.config && typeof networkConfig.config === 'object') {
      const walletManager = walletManagers[networkName]

      if (!walletManager) {
        throw createErrorWithCode(
          `No wallet manager found for blockchain: ${networkName}`,
          ERROR_CODES.BAD_REQUEST
        )
      }

      logger.info(`Registering ${networkName} wallet dynamically`)
      wdk.registerWallet(networkName, walletManager, networkConfig.config)
      registeredBlockchains.push(networkName)
    }
  }

  if (registeredBlockchains.length === 0) {
    throw createErrorWithCode(
      'No valid network configurations provided',
      ERROR_CODES.BAD_REQUEST
    )
  }

  return {
    status: 'registered',
    blockchains: JSON.stringify(registeredBlockchains)
  }
}

/**
 * @param {{ config: string }} request
 * @param {Object} context
 * @returns {Promise<{ status: string }>}
 */
async function registerProtocolHandler (request, context) {
  const { config: workletConfig } = request
  const { wdk, protocolManagers, walletManagers } = context

  const protocolConfigs = validateJSON(workletConfig, 'config')

  if (!wdk) {
    throw createErrorWithCode(
      'WDK not initialized. Call initializeWDK first.',
      ERROR_CODES.WDK_MANAGER_INIT
    )
  }

  for (const protocolConfig of Object.values(protocolConfigs)) {
    const protocolName = protocolConfig.protocolName

    if (protocolConfig && typeof protocolConfig === 'object') {
      const protocolManager = protocolManagers[protocolName]

      if (!protocolManager) {
        throw createErrorWithCode(
          `No protocol manager found for protocol: ${protocolName}`,
          ERROR_CODES.BAD_REQUEST
        )
      }

      if (!walletManagers[protocolConfig.blockchain]) {
        throw createErrorWithCode(
          `No wallet manager found for network: ${protocolConfig.blockchain}`,
          ERROR_CODES.BAD_REQUEST
        )
      }

      logger.info(`Registering ${protocolName} protocol`)
      wdk.registerProtocol(
        protocolConfig.blockchain,
        protocolName,
        protocolManager,
        protocolConfig.config
      )
    }
  }

  return { status: 'registered' }
}

module.exports = {
  registerWalletHandler,
  registerProtocolHandler
}
