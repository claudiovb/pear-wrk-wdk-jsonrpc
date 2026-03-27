'use strict'

const secrets = require('./secrets')
const lifecycle = require('./lifecycle')
const execution = require('./execution')
const config = require('./config')

module.exports = {
  ...secrets,
  ...lifecycle,
  ...execution,
  ...config
}
