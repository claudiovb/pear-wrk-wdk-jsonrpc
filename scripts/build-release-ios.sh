#!/bin/bash
# =============================================================================
# build-release.sh
#
# Builds all release artifacts for wdk-swift-core distribution:
#   - prebuilds.zip (BareKit.xcframework + wdk-worklet.mobile.bundle)
#   - addons.zip    (17 native addon xcframeworks)
#
# Usage:
#   ./scripts/build-release.sh [--barekit <path>]
#
# Example:
#   ./scripts/build-release.sh --barekit ../wdk-starter-swift/frameworks/BareKit.xcframework
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

BAREKIT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --barekit)
      BAREKIT_PATH="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--barekit <path-to-BareKit.xcframework>]"
      echo ""
      echo "Options:"
      echo "  --barekit <path>   Path to BareKit.xcframework (required for prebuilds.zip)"
      echo "  --help, -h         Show this help message"
      exit 0
      ;;
    *)
      echo "Error: Unexpected argument '$1'"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ADDONS=(
  "bare-abort"
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
mkdir -p "$RELEASE_DIR"

# ---------------------------------------------------------------------------
# Step 1: Build addons (bare-link)
# ---------------------------------------------------------------------------

echo "[1/4] Building addon xcframeworks..."
echo "      Running: npm run build:addons"
echo ""
npm run build:addons
echo ""

# ---------------------------------------------------------------------------
# Step 2: Build bundle (bare-pack)
# ---------------------------------------------------------------------------

echo "[2/4] Building worklet bundle..."
echo "      Running: npm run build:bundle"
echo ""
npm run build:bundle
echo ""
echo "      ESM→CJS conversion applied (chained in build:bundle)"

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
# Step 3: Build addons.zip (all 17 xcframeworks in one zip)
# ---------------------------------------------------------------------------

echo "[3/4] Building addons.zip..."
echo ""

ADDONS_STAGING="${RELEASE_DIR}/addons-staging"
mkdir -p "$ADDONS_STAGING"

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
  echo "      Adding ${XCFW_BASENAME}"
  cp -R "$XCFW" "$ADDONS_STAGING/$XCFW_BASENAME"
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

# Also generate addons.yml for XcodeGen
echo "      Generating addons.yml..."
cat > "$ADDONS_STAGING/addons.yml" << 'HEADER'
targets:
  wdk-starter-swift:
    dependencies:
HEADER

for addon in "${ADDONS[@]}"; do
  XCFW=$(find "$ADDONS_OUT_DIR" -maxdepth 1 -name "${addon}.*.xcframework" -type d 2>/dev/null | head -1)
  XCFW_BASENAME=$(basename "$XCFW")
  echo "      - framework: ${XCFW_BASENAME}" >> "$ADDONS_STAGING/addons.yml"
done

# Create the zip
(cd "$ADDONS_STAGING" && zip -r -q "../addons.zip" .)
rm -rf "$ADDONS_STAGING"

echo "      Created: ${RELEASE_DIR}/addons.zip (18 xcframeworks + addons.yml)"
echo ""

# ---------------------------------------------------------------------------
# Step 4: Build prebuilds.zip
# ---------------------------------------------------------------------------

echo "[4/4] Building prebuilds.zip..."

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
# Done
# ---------------------------------------------------------------------------

echo "============================================"
echo "  Build complete!"
echo "============================================"
echo ""
echo "Artifacts:"
echo "  ${RELEASE_DIR}/prebuilds.zip   (BareKit.xcframework + wdk-worklet.mobile.bundle)"
echo "  ${RELEASE_DIR}/addons.zip      (17 addon xcframeworks + addons.yml)"
echo ""
echo "Next steps:"
echo ""
echo "  1. Create a GitHub release and upload artifacts:"
echo ""
echo "     git tag v<VERSION>"
echo "     git push origin v<VERSION>"
echo "     gh release create v<VERSION> \\"
echo "       ${RELEASE_DIR}/prebuilds.zip \\"
echo "       ${RELEASE_DIR}/addons.zip \\"
echo "       --title \"v<VERSION>\" \\"
echo "       --notes \"Release notes here\""
echo ""
echo "  2. Consumer downloads prebuilds.zip + addons.zip from the release"
echo "     - Unzip prebuilds.zip: place BareKit.xcframework in frameworks/"
echo "       and wdk-worklet.mobile.bundle in project root"
echo "     - Unzip addons.zip into addons/ directory"
echo "     - Run: xcodegen generate"
echo ""
