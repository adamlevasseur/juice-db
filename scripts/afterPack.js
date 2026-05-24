const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const os = require('os')

/**
 * Post-packaging script that:
 * 1. Fixes the ElectronAsarIntegrity hash (electron-builder 26.x bug)
 * 2. Signs the app with hardened runtime + JIT entitlement (required on macOS 26)
 */
exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir
  const platform = context.packager.platform.name

  if (platform !== 'mac') return

  const appName = context.packager.appInfo.productName
  const appPath = path.join(appOutDir, `${appName}.app`)
  const infoPlist = path.join(appPath, 'Contents', 'Info.plist')
  const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar')

  if (!fs.existsSync(asarPath) || !fs.existsSync(infoPlist)) return

  // Step 1: Fix ElectronAsarIntegrity hash (bug in electron-builder 26.x)
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(asarPath)).digest('hex')
  try {
    execSync(
      `/usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash ${actualHash}" "${infoPlist}"`,
      { stdio: 'pipe' }
    )
    console.log(`[afterPack] Fixed ElectronAsarIntegrity hash: ${actualHash}`)
  } catch {
    try {
      execSync(`/usr/libexec/PlistBuddy -c "Delete :ElectronAsarIntegrity" "${infoPlist}"`, { stdio: 'ignore' })
      console.log('[afterPack] Removed stale ElectronAsarIntegrity key')
    } catch {}
  }

  // Step 2: Sign with hardened runtime + JIT entitlement (required on macOS 26)
  const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>`

  const entitlementsPath = path.join(os.tmpdir(), 'juicedb-entitlements.plist')
  fs.writeFileSync(entitlementsPath, entitlements)

  try {
    execSync(
      `codesign --sign - --force --options runtime --entitlements "${entitlementsPath}" --deep "${appPath}"`,
      { stdio: 'pipe' }
    )
    console.log('[afterPack] Signed app with hardened runtime + JIT entitlement')
  } catch (err) {
    console.warn('[afterPack] Warning: code signing failed:', err.message)
  }
}
