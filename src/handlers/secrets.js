'use strict'

const { entropyToMnemonic, mnemonicToSeedSync, mnemonicToEntropy } = require('@scure/bip39')
const { wordlist } = require('@scure/bip39/wordlists/english')

const { memzero, decrypt, generateEntropy, encryptSecrets } = require('../utils/crypto')
const {
  validateBase64,
  validateMnemonic,
  validateWordCount,
  validateRequest
} = require('../utils/validation')

/**
 * @param {{ wordCount: number }} request
 * @returns {Promise<{ encryptionKey: string, encryptedSeedBuffer: string, encryptedEntropyBuffer: string }>}
 */
async function generateEntropyAndEncryptHandler (request) {
  const { wordCount } = request

  validateRequest(request, () => validateWordCount(wordCount, 'wordCount'))

  const entropy = generateEntropy(wordCount)
  const mnemonic = entropyToMnemonic(entropy, wordlist)

  const seedBuffer = mnemonicToSeedSync(mnemonic)
  const entropyBuffer = Buffer.from(entropy)

  const { encryptionKey, encryptedSeedBuffer, encryptedEntropyBuffer } = encryptSecrets(seedBuffer, entropyBuffer)

  memzero(entropy)
  memzero(seedBuffer)
  memzero(entropyBuffer)

  return {
    encryptionKey,
    encryptedSeedBuffer,
    encryptedEntropyBuffer
  }
}

/**
 * @param {{ encryptedEntropy: string, encryptionKey: string }} request
 * @returns {Promise<{ mnemonic: string }>}
 */
async function getMnemonicFromEntropyHandler (request) {
  const { encryptedEntropy, encryptionKey } = request

  validateRequest(request, () => {
    validateBase64(encryptedEntropy, 'encryptedEntropy')
    validateBase64(encryptionKey, 'encryptionKey')
  })

  const entropyBuffer = decrypt(encryptedEntropy, encryptionKey)
  const entropy = new Uint8Array(entropyBuffer.length)
  entropy.set(entropyBuffer)

  const mnemonic = entropyToMnemonic(entropy, wordlist)

  memzero(entropyBuffer)
  memzero(entropy)

  return { mnemonic }
}

/**
 * @param {{ mnemonic: string }} request
 * @returns {Promise<{ encryptionKey: string, encryptedSeedBuffer: string, encryptedEntropyBuffer: string }>}
 */
async function getSeedAndEntropyFromMnemonicHandler (request) {
  const { mnemonic } = request

  validateRequest(request, () => validateMnemonic(mnemonic, 'mnemonic'))

  const seed = mnemonicToSeedSync(mnemonic)
  const entropy = mnemonicToEntropy(mnemonic, wordlist)

  return encryptSecrets(seed, entropy)
}

module.exports = {
  generateEntropyAndEncryptHandler,
  getMnemonicFromEntropyHandler,
  getSeedAndEntropyFromMnemonicHandler
}
