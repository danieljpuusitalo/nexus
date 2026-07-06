import * as esbuild from 'esbuild'
import { cpSync, mkdirSync } from 'fs'

const watch = process.argv.includes('--watch')

const commonOptions = {
  bundle: true,
  target: 'chrome120',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
}

const entries = [
  { entryPoints: ['src/background.ts'], outfile: 'dist/background.js' },
  { entryPoints: ['src/content.ts'], outfile: 'dist/content.js' },
  { entryPoints: ['src/popup.ts'], outfile: 'dist/popup.js' },
]

// Copy static files
mkdirSync('dist', { recursive: true })
mkdirSync('dist/icons', { recursive: true })
cpSync('manifest.json', 'dist/manifest.json')
cpSync('popup.html', 'dist/popup.html')
cpSync('popup.css', 'dist/popup.css')
cpSync('src/content.css', 'dist/content.css')
cpSync('icons', 'dist/icons', { recursive: true })

if (watch) {
  for (const entry of entries) {
    const ctx = await esbuild.context({ ...commonOptions, ...entry })
    await ctx.watch()
  }
  console.log('Watching for changes...')
} else {
  for (const entry of entries) {
    await esbuild.build({ ...commonOptions, ...entry })
  }
  console.log('Build complete!')
}
