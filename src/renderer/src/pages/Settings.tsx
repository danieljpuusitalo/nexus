import { useEffect, useState } from 'react'

const LINKEDIN_COLUMNS: Record<string, string> = {
  'First Name': 'first_name',
  'Last Name': 'last_name',
  'Email Address': 'email',
  'Company': 'company',
  'Position': 'job_title',
  'Connected On': 'how_we_met'
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else current += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { result.push(current.trim()); current = '' }
        else current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

export default function Settings() {
  const [stats, setStats] = useState<Record<string, number> | null>(null)

  // Import state
  const [importStep, setImportStep] = useState<'idle' | 'mapping' | 'preview' | 'done'>('idle')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('skip')
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)

  // Reset confirm
  const [resetStep, setResetStep] = useState(0)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const data = await window.api.data.stats()
    setStats(data as Record<string, number>)
  }

  async function handleExportCsv() {
    await window.api.data.exportCsv()
  }

  async function handleBackup() {
    await window.api.data.backup()
  }

  async function handleImportCsv(linkedin = false) {
    const content = await window.api.data.importSelectCsv()
    if (!content) return
    const { headers, rows } = parseCsv(content as string)
    if (headers.length === 0) return
    setCsvHeaders(headers)
    setCsvRows(rows)

    // Auto-map columns
    const map: Record<string, string> = {}
    const contactFields = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'notes', 'how_we_met']

    if (linkedin) {
      // LinkedIn auto-mapping
      for (const h of headers) {
        if (LINKEDIN_COLUMNS[h]) map[h] = LINKEDIN_COLUMNS[h]
      }
    } else {
      // Best-effort auto-mapping
      for (const h of headers) {
        const lower = h.toLowerCase().replace(/[^a-z]/g, '')
        const match = contactFields.find(f => f.replace('_', '') === lower || lower.includes(f.replace('_', '')))
        if (match) map[h] = match
        else if (lower.includes('first') && lower.includes('name')) map[h] = 'first_name'
        else if (lower.includes('last') && lower.includes('name')) map[h] = 'last_name'
        else if (lower.includes('email')) map[h] = 'email'
        else if (lower.includes('phone')) map[h] = 'phone'
        else if (lower.includes('company') || lower.includes('organization')) map[h] = 'company'
        else if (lower.includes('title') || lower.includes('position')) map[h] = 'job_title'
        else if (lower.includes('linkedin')) map[h] = 'linkedin_url'
      }
    }
    setColumnMap(map)
    setImportStep('mapping')
  }

  function handlePreview() {
    setImportStep('preview')
  }

  async function handleExecuteImport() {
    // Build mapped rows
    const mapped = csvRows.map(row => {
      const obj: Record<string, string> = {}
      csvHeaders.forEach((h, i) => {
        const field = columnMap[h]
        if (field && row[i]) obj[field] = row[i]
      })
      return obj
    })
    const result = await window.api.data.importExecute(mapped, duplicateMode)
    setImportResult(result as { imported: number; skipped: number })
    setImportStep('done')
    await loadStats()
  }

  function resetImport() {
    setImportStep('idle')
    setCsvHeaders([])
    setCsvRows([])
    setColumnMap({})
    setImportResult(null)
  }

  async function handleReset() {
    if (resetStep < 2) {
      setResetStep(resetStep + 1)
      return
    }
    await window.api.data.resetDatabase()
    setResetStep(0)
    await loadStats()
  }

  const contactFields = [
    { value: '', label: '— skip —' },
    { value: 'first_name', label: 'First Name' },
    { value: 'last_name', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'company', label: 'Company' },
    { value: 'job_title', label: 'Job Title' },
    { value: 'linkedin_url', label: 'LinkedIn URL' },
    { value: 'notes', label: 'Notes' },
    { value: 'how_we_met', label: 'How We Met' }
  ]

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Data management and configuration</p>
        </div>

        {/* Data Stats */}
        {stats && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Data Overview</h2>
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(stats).map(([key, val]) => (
                <div key={key} className="border border-zinc-800/60 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-zinc-200">{val}</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{key}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Import / Export */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Import &amp; Export</h2>
          <div className="space-y-3">
            {importStep === 'idle' && (
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => handleImportCsv(false)}
                  className="px-4 py-2 text-sm font-medium text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors"
                >
                  Import from CSV
                </button>
                <button
                  onClick={() => handleImportCsv(true)}
                  className="px-4 py-2 text-sm font-medium text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors"
                >
                  Import from LinkedIn
                </button>
                <button
                  onClick={handleExportCsv}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 border border-zinc-700/50 rounded-lg hover:bg-zinc-800/50 transition-colors"
                >
                  Export All as CSV
                </button>
              </div>
            )}

            {/* Mapping step */}
            {importStep === 'mapping' && (
              <div className="border border-violet-500/20 rounded-xl p-5 bg-violet-500/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-violet-400">Map CSV Columns</h3>
                  <span className="text-xs text-zinc-500">{csvRows.length} rows found</span>
                </div>
                <div className="space-y-2 mb-4">
                  {csvHeaders.map(h => (
                    <div key={h} className="flex items-center gap-3">
                      <span className="text-sm text-zinc-300 w-40 truncate flex-shrink-0">{h}</span>
                      <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10M10 5l3 3-3 3" /></svg>
                      <select
                        value={columnMap[h] || ''}
                        onChange={e => setColumnMap({ ...columnMap, [h]: e.target.value })}
                        className="flex-1 bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none"
                      >
                        {contactFields.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-zinc-500">Duplicates (by email):</span>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                    <input type="radio" name="dup" checked={duplicateMode === 'skip'} onChange={() => setDuplicateMode('skip')} className="accent-violet-500" />
                    Skip
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                    <input type="radio" name="dup" checked={duplicateMode === 'update'} onChange={() => setDuplicateMode('update')} className="accent-violet-500" />
                    Update
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={handlePreview} className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">
                    Preview
                  </button>
                  <button onClick={resetImport} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
                </div>
              </div>
            )}

            {/* Preview step */}
            {importStep === 'preview' && (
              <div className="border border-violet-500/20 rounded-xl p-5 bg-violet-500/5">
                <h3 className="text-sm font-medium text-violet-400 mb-3">Preview (first 5 rows)</h3>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500">
                        {Object.values(columnMap).filter(Boolean).map(f => (
                          <th key={f} className="text-left px-2 py-1 font-medium">{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 5).map((row, ri) => (
                        <tr key={ri} className="border-t border-zinc-800/30">
                          {csvHeaders.map((h, hi) => {
                            if (!columnMap[h]) return null
                            return <td key={hi} className="px-2 py-1.5 text-zinc-300 truncate max-w-[150px]">{row[hi] || ''}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleExecuteImport} className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">
                    Import {csvRows.length} Rows
                  </button>
                  <button onClick={() => setImportStep('mapping')} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Back</button>
                  <button onClick={resetImport} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
                </div>
              </div>
            )}

            {/* Done step */}
            {importStep === 'done' && importResult && (
              <div className="border border-emerald-500/20 rounded-xl p-5 bg-emerald-500/5">
                <h3 className="text-sm font-medium text-emerald-400 mb-2">Import Complete</h3>
                <p className="text-sm text-zinc-300">
                  Imported <span className="font-semibold text-emerald-400">{importResult.imported}</span> contacts.
                  {importResult.skipped > 0 && <> Skipped <span className="text-zinc-400">{importResult.skipped}</span>.</>}
                </p>
                <button onClick={resetImport} className="mt-3 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                  Done
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Backup */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Backup</h2>
          <button
            onClick={handleBackup}
            className="px-4 py-2 text-sm font-medium text-zinc-400 border border-zinc-700/50 rounded-lg hover:bg-zinc-800/50 transition-colors"
          >
            Export Database Backup
          </button>
          <p className="text-xs text-zinc-600 mt-2">Saves a copy of the entire SQLite database file.</p>
        </section>

        {/* Danger Zone */}
        <section>
          <h2 className="text-xs font-semibold text-red-400/70 uppercase tracking-wider mb-3">Danger Zone</h2>
          <div className="border border-red-500/15 rounded-xl p-5 bg-red-500/5">
            <p className="text-sm text-zinc-400 mb-3">Permanently delete all data. This cannot be undone.</p>
            {resetStep === 0 && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                Reset Database
              </button>
            )}
            {resetStep === 1 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-red-400">Are you sure? This deletes everything.</span>
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  Yes, continue
                </button>
                <button onClick={() => setResetStep(0)} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                  Cancel
                </button>
              </div>
            )}
            {resetStep === 2 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-red-400 font-semibold">Final confirmation — all data will be lost.</span>
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
                >
                  Delete Everything
                </button>
                <button onClick={() => setResetStep(0)} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
