# WDK JSON-RPC Bundler

Minimal bundler that produces ready-to-use worklet bundles and native addon frameworks for iOS, macOS, and Android. The bundle runs inside the [Bare runtime](https://github.com/holepunchto/bare-kit/) as an isolated worklet, exposing WDK wallet operations over JSON-RPC 2.0.

All handler logic, utilities, and the JSON-RPC transport layer live in [`pear-wrk-wdk`](https://github.com/claudiovb/pear-wrk-wdk/tree/jsonrpc). This project provides only the entry point (`src/wdk-worklet.js`), wallet package dependencies, and build tooling.

## What This Produces

| Artifact                     | Description                          |
| ---------------------------- | ------------------------------------ |
| `wdk-worklet.mobile.bundle`  | JavaScript worklet for iOS           |
| `wdk-worklet.macos.bundle`   | JavaScript worklet for macOS         |
| `wdk-worklet.android.bundle` | JavaScript worklet for Android       |
| `ios-addons/`                | 18 native addon xcframeworks for iOS |
| `mac-addons/`                | 17 native addon frameworks for macOS |

BareKit (the Bare runtime) is **not** included -- get it from [bare-kit](https://github.com/holepunchto/bare-kit/releases).

## Quick Start

```bash
npm install

# iOS
npm run build:all

# macOS
npm run build:all:macos

# Android
npm run build:all:android
```

## Build Commands

### iOS

```bash
npm run build:all          # Build addons + bundle
npm run build:addons       # Native addons only (ios-addons/)
npm run build:bundle       # Worklet bundle only (generated/wdk-worklet.mobile.bundle)
```

### macOS

```bash
npm run build:all:macos
npm run build:addons:macos
npm run build:bundle:macos
```

### Android

```bash
npm run build:all:android
npm run build:addons:android
npm run build:bundle:android
```

### Release Artifacts

Package zipped artifacts ready for a GitHub release:

```bash
# iOS: produces release/prebuilds.zip + release/addons.zip
./scripts/build-release-ios.sh

# macOS: produces release/macos-prebuilds.zip + release/macos-addons.zip
./scripts/build-release-macos.sh
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

Any EVM network uses `blockchain: "ethereum"` with different config. You are not limited to predefined network names.

## Config Format

Each network entry has an arbitrary label, a `blockchain` field (determines the wallet manager), and a `config` object (passed to the wallet manager):

```json
{
  "networks": {
    "eth_mainnet": {
      "blockchain": "ethereum",
      "config": {
        "chainId": 1,
        "provider": "https://rpc.mevblocker.io/fast"
      }
    },
    "polygon": {
      "blockchain": "ethereum",
      "config": {
        "chainId": 137,
        "provider": "https://polygon-rpc.com"
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

This format is compatible with the HRPC transport in `pear-wrk-wdk`.

## JSON-RPC Methods

All methods follow JSON-RPC 2.0 over length-prefixed framing on BareKit IPC.

### `workletStart`

Confirm the worklet is ready.

**Parameters:** None
**Returns:** `{ "status": "started" }`

### `generateEntropyAndEncrypt`

Generate a new BIP39 mnemonic seed with entropy and return encrypted versions.

**Parameters:** `{ "wordCount": 12 }` (12 or 24)

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

**Returns:** `{ "mnemonic": "word1 word2 ... word12" }`

### `getSeedAndEntropyFromMnemonic`

Convert a mnemonic phrase to encrypted seed and entropy.

**Parameters:** `{ "mnemonic": "word1 word2 ... word12" }`

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

**Returns:** `{ "status": "initialized" }`

### `callMethod`

Call any method on a WDK account.

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

- `args` -- Arrays spread as positional arguments, objects/primitives passed as single arg, null means no args.
- `options` -- Optional: `protocolType`, `protocolName`, `defaultValue`

**Returns:** `{ "result": <method result> }`

### `registerWallet`

Dynamically register additional wallets after initialization.

**Parameters:** `{ "config": "<JSON string of network configs>" }`

**Returns:** `{ "status": "registered", "blockchains": "[\"ethereum\"]" }`

### `registerProtocol`

Register protocol support (swap, bridge, lending, fiat).

**Parameters:** `{ "config": "<JSON string of protocol configs>" }`

**Returns:** `{ "status": "registered" }`

### `dispose`

Dispose the WDK instance and clean up resources.

**Parameters:** None
**Returns:** `{ "status": "disposed" }`

## Error Handling

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

| Code               | Description                                |
| ------------------ | ------------------------------------------ |
| `BAD_REQUEST`      | Invalid request parameters                 |
| `WDK_MANAGER_INIT` | WDK or wallet manager initialization error |
| `ACCOUNT_BALANCES` | Account operation error                    |
| `INTERNAL_ERROR`   | Unhandled internal error                   |
| `UNKNOWN`          | Unknown error                              |

## Architecture

```
wdk-bundler/
├── src/
│   └── wdk-worklet.js           # Entry point (imports from pear-wrk-wdk/jsonrpc)
├── scripts/
│   ├── build-release-ios.sh      # Package iOS release artifacts
│   ├── build-release-macos.sh    # Package macOS release artifacts
│   ├── link-bare-addons.js       # Build native addon frameworks
│   └── convert-bundle-esm-to-cjs.js  # Post-process bundle for JSC
├── stubs/
│   └── ledger-bitcoin/           # Stub for optional peer dep
├── pack.imports.json             # bare-pack import map
└── package.json
```

The entry point (`src/wdk-worklet.js`) does three things:

1. Sets up polyfills for JavaScriptCore (TextEncoder, .mjs extension)
2. Imports and configures wallet managers with lazy loading
3. Calls `registerJsonRpcHandlers(ipc, context)` from `pear-wrk-wdk/jsonrpc`

All handler logic, transport framing, utilities, and error handling live in [`pear-wrk-wdk`](https://github.com/tetherto/pear-wrk-wdk).

## Adding a New Blockchain

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

Then add the package to `package.json` and rebuild.

## Security

- All sensitive data encrypted with AES-256-GCM
- Encryption keys generated using `bare-crypto` (CSPRNG)
- Sensitive buffers zeroed after use
- Worklet runs in an isolated Bare runtime sandbox

## License

Apache-2.0

## Author

Tether
