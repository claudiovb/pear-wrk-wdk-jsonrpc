# pear-wrk-wdk-jsonrpc

Simplified JSON-RPC worklet for WDK (Web3 Development Kit). This worklet provides a pure JSON-RPC 2.0 interface to WDK functionality without HRPC, code generation, or schema complexity.

## Features

- **Pure JSON-RPC 2.0**: Simple, standard JSON-RPC protocol
- **No Code Generation**: Direct imports of WDK modules
- **Multi-Chain Support**: Ethereum, Polygon, Arbitrum, Sepolia, Solana
- **ERC-4337 Support**: Account abstraction for EVM chains
- **Mnemonic Management**: Secure BIP39 mnemonic generation and handling
- **Encryption**: AES-256-GCM encryption for sensitive data

## Installation

```bash
npm install
```

## Build Commands

> **Note:** When building the iOS demo app in Xcode, the worklet is **automatically built** via pre-actions. These manual commands are only needed for testing the JavaScript code outside of Xcode or for standalone development.

### Build Worklet Bundle

Generate the iOS worklet bundle:

```bash
npm run build:bundle
```

This creates `generated/wdk-worklet.mobile.bundle` that can be loaded in iOS apps.

### Build Bare Addons

Generate iOS addons for native modules:

```bash
npm run build:addons
```

This creates `ios-addons/` directory with compiled native addons.

### Build Everything

Build both addons and bundle:

```bash
npm run build:all
```

### Clean Build Artifacts

Remove generated files:

```bash
npm run clean
```

## Supported Networks

The worklet includes support for the following networks:

- `ethereum` - Ethereum mainnet (EVM)
- `polygon` - Polygon network (EVM)
- `arbitrum` - Arbitrum One (EVM)
- `sepolia` - Ethereum Sepolia testnet (EVM)
- `ethereum-erc4337` - Ethereum with ERC-4337 account abstraction
- `solana` - Solana network

## JSON-RPC Methods

### `workletStart`

Start the worklet and confirm it's ready.

**Parameters:** None

**Returns:**

```json
{
  "status": "started"
}
```

### `generateEntropyAndEncrypt`

Generate a new mnemonic seed with entropy and return encrypted versions.

**Parameters:**

```json
{
  "wordCount": 12 // or 24
}
```

**Returns:**

```json
{
  "encryptionKey": "base64-encoded-key",
  "encryptedSeedBuffer": "base64-encoded-encrypted-seed",
  "encryptedEntropyBuffer": "base64-encoded-encrypted-entropy"
}
```

### `getMnemonicFromEntropy`

Retrieve mnemonic phrase from encrypted entropy.

**Parameters:**

```json
{
  "encryptedEntropy": "base64-encoded-encrypted-entropy",
  "encryptionKey": "base64-encoded-key"
}
```

**Returns:**

```json
{
  "mnemonic": "12 or 24 word phrase"
}
```

### `getSeedAndEntropyFromMnemonic`

Convert a mnemonic phrase to encrypted seed and entropy.

**Parameters:**

```json
{
  "mnemonic": "12 or 24 word phrase"
}
```

**Returns:**

```json
{
  "encryptionKey": "base64-encoded-key",
  "encryptedSeedBuffer": "base64-encoded-encrypted-seed",
  "encryptedEntropyBuffer": "base64-encoded-encrypted-entropy"
}
```

### `initializeWDK`

Initialize WDK with encrypted seed and network configurations.

**Parameters:**

```json
{
  "encryptionKey": "base64-encoded-key",
  "encryptedSeed": "base64-encoded-encrypted-seed",
  "config": "{\"networks\": {\"ethereum\": {...}}}"
}
```

**Network Config Example:**

```json
{
  "networks": {
    "ethereum": {
      "chainId": 1,
      "blockchain": "ethereum",
      "provider": "https://rpc.mevblocker.io/fast",
      "transferMaxFee": 100000
    },
    "solana": {
      "cluster": "mainnet-beta",
      "rpcUrl": "https://api.mainnet-beta.solana.com"
    }
  }
}
```

**Returns:**

```json
{
  "status": "initialized"
}
```

### `callMethod`

Call any method on a WDK account.

**Parameters:**

```json
{
  "methodName": "getAddress",
  "network": "ethereum",
  "accountIndex": 0,
  "args": "{...}", // Optional JSON string
  "options": "{...}" // Optional JSON string
}
```

**Common Methods:**

- `getAddress()` - Get account address
- `getBalance()` - Get account balance
- `signTransaction(tx)` - Sign a transaction
- `sendTransaction(tx)` - Send a transaction

**Returns:**

```json
{
  "result": "JSON-stringified result"
}
```

### `registerWallet`

Dynamically register additional wallets after initialization.

**Parameters:**

```json
{
  "config": "{\"networks\": {\"polygon\": {...}}}"
}
```

**Returns:**

```json
{
  "status": "registered",
  "blockchains": "[\"polygon\"]"
}
```

### `registerProtocol`

Register protocol support (swap, bridge, lending, fiat).

**Parameters:**

```json
{
  "config": "{\"protocols\": {\"USDT0\": {...}}}"
}
```

**Returns:**

```json
{
  "status": "registered"
}
```

### `dispose`

Dispose the WDK instance and clean up resources.

**Parameters:** None

**Returns:**

```json
{
  "status": "disposed"
}
```

## Error Handling

All methods return structured errors with error codes:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Descriptive error message"
  }
}
```

**Error Codes:**

- `UNKNOWN` - Unknown error
- `BAD_REQUEST` - Invalid request parameters
- `WDK_MANAGER_INIT` - WDK initialization error
- `ACCOUNT_BALANCES` - Account operation error

## Security

- All sensitive data (seeds, mnemonics, private keys) are encrypted with AES-256-GCM
- Encryption keys are randomly generated using cryptographically secure methods
- Memory is zeroed out after use (where possible in JavaScript)
- Never log or expose sensitive data in production

## Architecture

```
pear-wrk-wdk-jsonrpc/
├── src/
│   ├── wdk-worklet.js       # Main entry point
│   ├── rpc-handlers.js      # JSON-RPC handlers
│   ├── utils/               # Utility functions
│   │   ├── logger.js
│   │   ├── validation.js
│   │   ├── crypto.js
│   │   └── safe-stringify.js
│   └── exceptions/          # Error handling
│       ├── error-codes.js
│       └── rpc-exception.js
├── package.json
└── pack.imports.json
```

## Development

### Log Levels

Control logging via environment variables:

```bash
LOG_LEVEL=DEBUG npm run build:bundle
```

Available levels: `DEBUG`, `INFO`, `WARN`, `ERROR`, `NONE`

### Adding New Networks

To add support for a new network, update the `walletManagers` object in `src/rpc-handlers.js`:

```javascript
const walletManagers = {
  // ... existing networks ...
  "my-network": EVMWallet, // or appropriate wallet manager
};
```

## License

Apache-2.0

## Author

Tether
