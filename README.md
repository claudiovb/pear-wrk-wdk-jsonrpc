# pear-wrk-wdk-jsonrpc

JSON-RPC worklet for WDK (Wallet Development Kit). Provides a JSON-RPC 2.0 interface to WDK functionality, designed to run inside the Bare runtime as an isolated worklet for mobile apps.

This project shares its handler logic, utilities, and config format with the HRPC version ([pear-wrk-wdk](https://github.com/tetherto/pear-wrk-wdk)), enabling an eventual codebase merge. The only difference is the transport layer: JSON-RPC with length-prefixed framing (here) vs. binary HRPC.

## Features

- **JSON-RPC 2.0** with length-prefixed framing over BareKit IPC
- **HRPC-compatible config format** -- same config works on both JSON-RPC and HRPC transports
- **Multi-chain support** -- Ethereum (all EVM), Bitcoin, Solana, ERC-4337
- **Lazy wallet loading** -- wallet SDKs are only loaded when `initializeWDK` is called
- **Context-based handlers** -- portable handler modules identical to HRPC
- **Secure key management** -- AES-256-GCM encryption, memory zeroing

## Installation

```bash
npm install
```

## Build Commands

> **Note:** When building the iOS demo app in Xcode, the worklet is **automatically built** via pre-actions. These manual commands are only needed for testing outside of Xcode or for standalone development.

### iOS

```bash
npm run build:all          # Build addons + bundle
npm run build:addons       # Native addons only (ios-addons/)
npm run build:bundle       # Worklet bundle only (generated/wdk-worklet.mobile.bundle)
```

### macOS

```bash
npm run build:all:macos
```

### Android

```bash
npm run build:all:android
```

### Clean

```bash
npm run clean
```

## Supported Blockchains

The `blockchain` field in the config determines which wallet manager is used:

| Blockchain         | Package                             | Description                                                             |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------- |
| `ethereum`         | `@tetherto/wdk-wallet-evm`          | All EVM-compatible networks (mainnet, sepolia, polygon, arbitrum, etc.) |
| `ethereum-erc4337` | `@tetherto/wdk-wallet-evm-erc-4337` | EVM with account abstraction                                            |
| `bitcoin`          | `@tetherto/wdk-wallet-btc`          | Bitcoin (mainnet, testnet)                                              |
| `solana`           | `@tetherto/wdk-wallet-solana`       | Solana                                                                  |

Any EVM network (mainnet, sepolia, polygon, arbitrum, custom chains) uses `blockchain: "ethereum"` with different config. You are not limited to predefined network names.

## Config Format

The config uses the HRPC-compatible nested format. Each network entry has an arbitrary label, a `blockchain` field (determines the wallet manager), and a `config` object (passed to the wallet manager):

```json
{
  "networks": {
    "eth_mainnet": {
      "blockchain": "ethereum",
      "config": {
        "chainId": 1,
        "provider": "https://rpc.mevblocker.io/fast",
        "transferMaxFee": 100000
      }
    },
    "sepolia": {
      "blockchain": "ethereum",
      "config": {
        "chainId": 11155111,
        "provider": "https://ethereum-sepolia-rpc.publicnode.com"
      }
    },
    "btc_testnet": {
      "blockchain": "bitcoin",
      "config": {
        "network": "testnet",
        "blockbookEndpoint": "https://blockbook.tbtc-1.zelcore.io"
      }
    }
  }
}
```

## JSON-RPC Methods

All methods follow the JSON-RPC 2.0 protocol. Requests use length-prefixed framing over BareKit IPC.

### `workletStart`

Confirm the worklet is ready.

**Parameters:** None

**Returns:**

```json
{ "status": "started" }
```

### `generateEntropyAndEncrypt`

Generate a new BIP39 mnemonic seed with entropy and return encrypted versions.

**Parameters:**

```json
{ "wordCount": 12 }
```

`wordCount` must be `12` or `24`.

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
{ "mnemonic": "word1 word2 ... word12" }
```

### `getSeedAndEntropyFromMnemonic`

Convert a mnemonic phrase to encrypted seed and entropy.

**Parameters:**

```json
{ "mnemonic": "word1 word2 ... word12" }
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
  "config": "<JSON string of config>"
}
```

The `config` field is a JSON string containing the network/protocol config (see [Config Format](#config-format) above).

**Returns:**

```json
{ "status": "initialized" }
```

### `callMethod`

Call any method on a WDK account. This is the generic handler for all account operations.

**Parameters:**

```json
{
  "methodName": "getAddress",
  "network": "ethereum",
  "accountIndex": 0,
  "args": "<optional JSON string>",
  "options": "<optional JSON string>"
}
```

- `methodName` -- the account method to call (e.g., `getAddress`, `getBalance`, `sign`, `verify`)
- `network` -- the network name as registered during `initializeWDK`
- `accountIndex` -- account index (0-based)
- `args` -- optional JSON string. Parsed and spread as positional arguments. Arrays spread as multiple args, objects/primitives passed as single arg, null/omitted means no args.
- `options` -- optional JSON string with `protocolType`, `protocolName`, `defaultValue`, `transformResult`

**Returns:**

```json
{ "result": "<JSON string of the method result>" }
```

The `result` field is always a JSON string (via `safeStringify`). The caller must `JSON.parse(result)` to get the actual value. BigInt values are converted to strings during serialization.

### `registerWallet`

Dynamically register additional wallets after initialization.

**Parameters:**

```json
{
  "config": "<JSON string of network configs>"
}
```

The config JSON parses to a flat object of network configs (same format as `networks` in `initializeWDK`, but without the outer `networks` wrapper):

```json
{
  "polygon_mainnet": {
    "blockchain": "ethereum",
    "config": { "chainId": 137, "provider": "https://polygon-rpc.com" }
  }
}
```

**Returns:**

```json
{
  "status": "registered",
  "blockchains": "[\"ethereum\"]"
}
```

### `registerProtocol`

Register protocol support (swap, bridge, lending, fiat).

**Parameters:**

```json
{
  "config": "<JSON string of protocol configs>"
}
```

**Returns:**

```json
{ "status": "registered" }
```

### `dispose`

Dispose the WDK instance and clean up resources.

**Parameters:** None

**Returns:**

```json
{ "status": "disposed" }
```

## Error Handling

All methods return structured errors:

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

| Code               | Description                                |
| ------------------ | ------------------------------------------ |
| `BAD_REQUEST`      | Invalid request parameters                 |
| `WDK_MANAGER_INIT` | WDK or wallet manager initialization error |
| `ACCOUNT_BALANCES` | Account operation error                    |
| `INTERNAL_ERROR`   | Unhandled internal error                   |
| `UNKNOWN`          | Unknown error                              |

## Architecture

```
pear-wrk-wdk-jsonrpc/
├── src/
│   ├── wdk-worklet.js          # Entry point (BareKit IPC, WDK + wallet imports, context)
│   ├── rpc-handlers.js         # registerJsonRpcHandlers + framing + dispatch
│   ├── handlers/               # Handler modules (context-based, identical to HRPC)
│   │   ├── index.js            # Re-exports all handlers
│   │   ├── secrets.js          # Entropy, mnemonic, seed handlers
│   │   ├── lifecycle.js        # initializeWDK, dispose
│   │   ├── execution.js        # callMethod + callWdkMethod
│   │   └── config.js           # registerWallet, registerProtocol
│   ├── utils/                  # Shared utilities (identical to HRPC)
│   │   ├── logger.js
│   │   ├── validation.js       # Validators + createErrorWithCode + validateRequest
│   │   ├── crypto.js           # AES-256-GCM, entropy generation, memory zeroing
│   │   └── safe-stringify.js   # BigInt-safe JSON serialization
│   └── exceptions/             # Error handling (identical to HRPC)
│       ├── error-codes.js
│       └── rpc-exception.js
├── test/
│   ├── test-handlers.js        # Handler tests (requires Bare runtime)
│   ├── test-imports-only.js    # Module import verification
│   └── test-framing.js         # Length-prefixed framing tests
├── stubs/
│   └── ledger-bitcoin/         # Stub for optional peer dep
├── package.json
└── pack.imports.json
```

### Context-Based Design

All handlers receive a `context` object:

```javascript
{
  (WDK, // WDK class
    walletManagers, // Map of blockchain name -> wallet manager class
    protocolManagers, // Map of protocol name -> protocol manager class
    wdk, // Current WDK instance (mutable, initially null)
    wdkLoadError); // Error if WDK failed to load (null otherwise)
}
```

The entry point (`wdk-worklet.js`) creates this context and passes it to `registerJsonRpcHandlers`. Handlers never import WDK or wallet packages directly -- they use `context.walletManagers[blockchain]` and `new context.WDK(seed)`.

### Transition to Library Package (Option A)

This codebase is structured as a stepping stone toward a full library split (like `pear-wrk-wdk`). To convert:

1. Delete `src/wdk-worklet.js` (entry point moves to consumer/bundler)
2. Remove WDK + wallet package dependencies from `package.json`
3. Add `worklet.js` export file
4. Consumer or bundler generates the entry point with their wallet config

No handler or utility code changes are needed -- they are already context-based and transport-agnostic.

## Security

- All sensitive data (seeds, mnemonics, private keys) encrypted with AES-256-GCM
- Encryption keys randomly generated using `bare-crypto` (CSPRNG)
- Sensitive buffers zeroed after use (`memzero`)
- Stack traces only included in error responses when `NODE_ENV=development`

## Development

### Running Tests

```bash
npm test                # Run all tests (requires Bare runtime)
npm run test:import     # Import verification only
npm run test:handlers   # Handler tests
```

### Log Levels

```bash
LOG_LEVEL=DEBUG bare src/wdk-worklet.js
```

Available levels: `DEBUG`, `INFO`, `WARN`, `ERROR`, `NONE`

### Adding a New Blockchain

Add a new `require` branch in `getWalletManager()` in `src/wdk-worklet.js`:

```javascript
} else if (network === 'my-chain') {
  mod = require('@tetherto/wdk-wallet-my-chain')
}
```

And add it to the `has` trap:

```javascript
has: (_, network) =>
  ["ethereum", "ethereum-erc4337", "solana", "bitcoin", "my-chain"].includes(
    network,
  );
```

No changes needed in handlers -- they use `context.walletManagers` dynamically.

## License

Apache-2.0

## Author

Tether
