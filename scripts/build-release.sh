#!/bin/bash
# =============================================================================
# build-release.sh
#
# Builds all release artifacts for wdk-swift-core distribution:
#   - 17 addon xcframework zips (for SPM binary targets)
#   - prebuilds.zip (BareKit.xcframework + wdk-worklet.mobile.bundle)
#   - binary-targets.swift snippet with URLs and SHA256 checksums
#
# Usage:
#   ./scripts/build-release.sh <github-release-base-url> [--barekit <path>]
#
# Example:
#   ./scripts/build-release.sh \
#     https://github.com/ArcadeLabsInc/pear-wrk-wdk-jsonrpc/releases/download/v1.0.0 \
#     --barekit ../wdk-starter-swift/frameworks/BareKit.xcframework
#
# Prerequisites:
#   - Node.js and npm installed
#   - npm install already run in this directory
#   - BareKit.xcframework available at the specified path
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

RELEASE_URL=""
BAREKIT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --barekit)
      BAREKIT_PATH="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 <github-release-base-url> [--barekit <path-to-BareKit.xcframework>]"
      echo ""
      echo "Arguments:"
      echo "  github-release-base-url   Base URL for GitHub release assets"
      echo "                            e.g. https://github.com/org/repo/releases/download/v1.0.0"
      echo ""
      echo "Options:"
      echo "  --barekit <path>          Path to BareKit.xcframework (required for prebuilds.zip)"
      echo "  --help, -h                Show this help message"
      exit 0
      ;;
    *)
      if [ -z "$RELEASE_URL" ]; then
        RELEASE_URL="$1"
      else
        echo "Error: Unexpected argument '$1'"
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$RELEASE_URL" ]; then
  echo "Error: Missing required argument <github-release-base-url>"
  echo "Usage: $0 <github-release-base-url> [--barekit <path>]"
  exit 1
fi

# Remove trailing slash from URL
RELEASE_URL="${RELEASE_URL%/}"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ADDONS=(
  "bare-buffer"
  "bare-crypto"
  "bare-dns"
  "bare-fs"
  "bare-hrtime"
  "bare-inspect"
  "bare-os"
  "bare-performance"
  "bare-pipe"
  "bare-signals"
  "bare-tcp"
  "bare-tls"
  "bare-tty"
  "bare-type"
  "bare-url"
  "bare-zlib"
  "sodium-native"
)

RELEASE_DIR="release"
ADDONS_OUT_DIR="ios-addons"

# ---------------------------------------------------------------------------
# Clean previous release artifacts
# ---------------------------------------------------------------------------

echo ""
echo "============================================"
echo "  WDK Swift Release Builder"
echo "============================================"
echo ""

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/addons"

# ---------------------------------------------------------------------------
# Step 1: Build addons (bare-link)
# ---------------------------------------------------------------------------

echo "[1/6] Building addon xcframeworks..."
echo "      Running: npm run build:addons"
echo ""
npm run build:addons
echo ""

# ---------------------------------------------------------------------------
# Step 2: Build bundle (bare-pack)
# ---------------------------------------------------------------------------

echo "[2/6] Building worklet bundle..."
echo "      Running: npm run build:bundle"
echo ""
npm run build:bundle
echo ""

# Verify bundle was created
BUNDLE_PATH="generated/wdk-worklet.mobile.bundle"
if [ ! -f "$BUNDLE_PATH" ]; then
  echo "Error: Bundle not found at $BUNDLE_PATH"
  echo "       Make sure bare-pack completed successfully."
  exit 1
fi
echo "      Bundle created: $BUNDLE_PATH"
echo ""

# ---------------------------------------------------------------------------
# Step 3: Zip each addon xcframework
# ---------------------------------------------------------------------------

echo "[3/6] Zipping addon xcframeworks..."
echo ""

MISSING_ADDONS=()

for addon in "${ADDONS[@]}"; do
  # Find the xcframework (name includes version, e.g. bare-crypto.1.13.0.xcframework)
  XCFW=$(find "$ADDONS_OUT_DIR" -maxdepth 1 -name "${addon}.*.xcframework" -type d 2>/dev/null | head -1)

  if [ -z "$XCFW" ]; then
    echo "      WARNING: xcframework not found for ${addon}"
    MISSING_ADDONS+=("$addon")
    continue
  fi

  XCFW_BASENAME=$(basename "$XCFW")
  ZIP_NAME="${addon}.xcframework.zip"

  echo "      Zipping ${XCFW_BASENAME} -> ${ZIP_NAME}"

  # Zip from the parent directory so the xcframework is at the root of the zip
  (cd "$ADDONS_OUT_DIR" && zip -r -q "../${RELEASE_DIR}/addons/${ZIP_NAME}" "$XCFW_BASENAME")
done

echo ""

if [ ${#MISSING_ADDONS[@]} -gt 0 ]; then
  echo "Error: The following addons were not found:"
  for m in "${MISSING_ADDONS[@]}"; do
    echo "  - $m"
  done
  echo ""
  echo "Make sure all addons built successfully in step 1."
  exit 1
fi

echo "      All 17 addon xcframeworks zipped."
echo ""

# ---------------------------------------------------------------------------
# Step 4: Build prebuilds.zip
# ---------------------------------------------------------------------------

echo "[4/6] Building prebuilds.zip..."

PREBUILDS_DIR="${RELEASE_DIR}/prebuilds-staging"
mkdir -p "$PREBUILDS_DIR"

# Copy bundle
cp "$BUNDLE_PATH" "$PREBUILDS_DIR/wdk-worklet.mobile.bundle"
echo "      Added: wdk-worklet.mobile.bundle"

# Copy BareKit.xcframework if provided
if [ -n "$BAREKIT_PATH" ]; then
  if [ ! -d "$BAREKIT_PATH" ]; then
    echo "Error: BareKit.xcframework not found at $BAREKIT_PATH"
    exit 1
  fi
  cp -R "$BAREKIT_PATH" "$PREBUILDS_DIR/BareKit.xcframework"
  echo "      Added: BareKit.xcframework"
else
  echo "      WARNING: --barekit not provided, prebuilds.zip will only contain the bundle."
  echo "               Pass --barekit <path> to include BareKit.xcframework."
fi

# Create the zip
(cd "$PREBUILDS_DIR" && zip -r -q "../prebuilds.zip" .)
rm -rf "$PREBUILDS_DIR"

echo "      Created: ${RELEASE_DIR}/prebuilds.zip"
echo ""

# ---------------------------------------------------------------------------
# Step 5: Compute SHA256 checksums for addon zips
# ---------------------------------------------------------------------------

echo "[5/6] Computing SHA256 checksums..."
echo ""

# Create the binary-targets.swift snippet
SNIPPET_FILE="${RELEASE_DIR}/binary-targets.swift"
cat > "$SNIPPET_FILE" << 'HEADER'
// =============================================================================
// Auto-generated by scripts/build-release.sh
// Paste these into Package.swift targets array
// =============================================================================

// Binary targets for WDK native addons
HEADER

for addon in "${ADDONS[@]}"; do
  ZIP_PATH="${RELEASE_DIR}/addons/${addon}.xcframework.zip"

  if [ ! -f "$ZIP_PATH" ]; then
    echo "      Error: ${ZIP_PATH} not found"
    exit 1
  fi

  CHECKSUM=$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')
  URL="${RELEASE_URL}/${addon}.xcframework.zip"

  # Convert addon name to valid Swift identifier (hyphens -> underscores)
  TARGET_NAME=$(echo "$addon" | sed 's/-/_/g')

  echo "      ${addon}: ${CHECKSUM:0:16}..."

  cat >> "$SNIPPET_FILE" << EOF
.binaryTarget(
    name: "${TARGET_NAME}",
    url: "${URL}",
    checksum: "${CHECKSUM}"
),
EOF
done

echo ""

# ---------------------------------------------------------------------------
# Step 6: Generate dependency list for Package.swift
# ---------------------------------------------------------------------------

echo "[6/6] Generating Package.swift dependency list..."

cat >> "$SNIPPET_FILE" << 'DEPS_HEADER'

// =============================================================================
// Add these to the WdkSwiftCore target dependencies array
// =============================================================================

// dependencies: [
//     .product(name: "BareKit", package: "bare-kit-swift"),
DEPS_HEADER

for addon in "${ADDONS[@]}"; do
  TARGET_NAME=$(echo "$addon" | sed 's/-/_/g')
  echo "//     \"${TARGET_NAME}\"," >> "$SNIPPET_FILE"
done

echo "// ]" >> "$SNIPPET_FILE"

echo ""
echo "============================================"
echo "  Build complete!"
echo "============================================"
echo ""
echo "Artifacts:"
echo "  ${RELEASE_DIR}/prebuilds.zip"
echo "  ${RELEASE_DIR}/addons/*.xcframework.zip  (17 files)"
echo "  ${RELEASE_DIR}/binary-targets.swift"
echo ""
echo "Next steps:"
echo ""
echo "  1. Create a GitHub release and upload all artifacts:"
echo ""
echo "     git tag v<VERSION>"
echo "     git push origin v<VERSION>"
echo ""
echo "     gh release create v<VERSION> \\"
echo "       ${RELEASE_DIR}/prebuilds.zip \\"

for addon in "${ADDONS[@]}"; do
  echo "       ${RELEASE_DIR}/addons/${addon}.xcframework.zip \\"
done

echo "       --title \"v<VERSION>\" \\"
echo "       --notes \"Release notes here\""
echo ""
echo "  2. Copy the contents of ${RELEASE_DIR}/binary-targets.swift"
echo "     into wdk-swift-core/Package.swift"
echo ""
echo "  3. Tag and push wdk-swift-core"
echo ""
