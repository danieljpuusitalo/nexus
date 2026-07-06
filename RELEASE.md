# Release Process

## Creating a Release

1. Update `version` in `package.json`
2. Commit: `git commit -am "Release vX.Y.Z"`
3. Tag: `git tag vX.Y.Z`
4. Push: `git push && git push --tags`
5. GitHub Actions builds Windows (.exe) and macOS (.dmg) installers automatically
6. Installers are uploaded as release artifacts on the GitHub Releases page
7. The auto-updater in existing installs picks up the new release automatically

## Code Signing Notes

### Windows
Without a code signing certificate, users will see a Windows SmartScreen warning on first install.
To dismiss: click "More info" then "Run anyway". This is expected for indie software.

Cost for EV code signing: ~$200-400/year (e.g., DigiCert, Sectigo).

### macOS
Without Apple notarization, macOS will block the app by default.
To open: right-click the .dmg, select "Open", then click "Open" in the dialog.

Notarization requires an Apple Developer account ($99/year).

## Manual Build

```bash
# Windows installer
npm run package

# macOS (must be on macOS)
npm run build && npx electron-builder --mac
```
