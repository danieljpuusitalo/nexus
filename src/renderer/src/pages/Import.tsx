import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { importGoogleContacts } from '../lib/google-contacts'
import { syncCalendarEvents } from '../lib/google-calendar'
import { isContactPickerAvailable, isElectron, pickPhoneContacts } from '../lib/phone-contacts'
import { useToast } from '../components/ui/Toast'
import { SourceCard, ResultsScreen, GmailConnectFlow, OutlookConnectFlow } from '../components/import'
import type { SourceStatus, ImportResultData } from '../components/import'

// Format-specific column mappings
const LINKEDIN_COLUMN_MAP: Record<string, string> = {
  'First Name': 'first_name', 'Last Name': 'last_name',
  'Email Address': 'email', 'Company': 'company',
  'Position': 'job_title', 'Connected On': 'how_we_met',
  'Website': 'website', 'Twitter': 'twitter_url', 'Facebook': 'facebook_url',
  'Instagram': 'instagram_url', 'Address': 'address', 'Education': 'education'
}

const DEX_COLUMN_MAP: Record<string, string> = {
  'First Name': 'first_name', 'Last Name': 'last_name',
  'Email': 'email', 'Email 1': 'email', 'Phone': 'phone', 'Phone 1': 'phone',
  'Company': 'company', 'Organization': 'company',
  'Title': 'job_title', 'Job Title': 'job_title',
  'LinkedIn': 'linkedin_url', 'LinkedIn URL': 'linkedin_url',
  'Notes': 'notes', 'Birthday': 'birthday',
  'Location': 'location', 'City': 'location',
  'How We Met': 'how_we_met', 'Met Via': 'how_we_met',
  'Tags': '_tags', 'Groups': '_groups',
  'Website': 'website', 'Twitter': 'twitter_url', 'Twitter URL': 'twitter_url',
  'Facebook': 'facebook_url', 'Facebook URL': 'facebook_url',
  'Instagram': 'instagram_url', 'Instagram URL': 'instagram_url',
  'Address': 'address', 'Street Address': 'address',
  'Education': 'education', 'School': 'education'
}

const CLAY_COLUMN_MAP: Record<string, string> = {
  'First name': 'first_name', 'Last name': 'last_name',
  'Email': 'email', 'Email address': 'email',
  'Phone': 'phone', 'Phone number': 'phone',
  'Organization': 'company', 'Company': 'company',
  'Title': 'job_title', 'Role': 'job_title',
  'LinkedIn': 'linkedin_url', 'LinkedIn URL': 'linkedin_url',
  'Notes': 'notes', 'Note': 'notes',
  'Birthday': 'birthday', 'Location': 'location',
  'Last Contacted': '_last_contacted',
  'Tags': '_tags', 'Groups': '_groups', 'Lists': '_groups',
  'Website': 'website', 'Twitter': 'twitter_url', 'Twitter URL': 'twitter_url',
  'Facebook': 'facebook_url', 'Facebook URL': 'facebook_url',
  'Instagram': 'instagram_url', 'Instagram URL': 'instagram_url',
  'Address': 'address', 'Street Address': 'address',
  'Education': 'education', 'School': 'education'
}

type DetectedFormat = 'dex' | 'clay' | 'linkedin' | 'nexus' | 'generic'

function detectFormat(headers: string[]): { format: DetectedFormat; label: string; columnMap: Record<string, string> } {
  const headerSet = new Set(headers.map(h => h.trim()))
  if (headerSet.has('first_name') && headerSet.has('last_name') && headerSet.has('keep_in_touch_days')) {
    return { format: 'nexus', label: 'Nexus Export', columnMap: {} }
  }
  if ((headerSet.has('First Name') || headerSet.has('first_name')) && (headerSet.has('Email 1') || headerSet.has('Met Via') || headerSet.has('How We Met'))) {
    return { format: 'dex', label: 'Dex', columnMap: DEX_COLUMN_MAP }
  }
  if (headerSet.has('First name') || (headerSet.has('Organization') && headerSet.has('Last Contacted'))) {
    return { format: 'clay', label: 'Clay', columnMap: CLAY_COLUMN_MAP }
  }
  if (headerSet.has('First Name') && headerSet.has('Last Name') && headerSet.has('Connected On')) {
    return { format: 'linkedin', label: 'LinkedIn', columnMap: LINKEDIN_COLUMN_MAP }
  }
  return { format: 'generic', label: 'CSV', columnMap: {} }
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip BOM (common in LinkedIn, Outlook CSV exports)
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split('\n').filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
        else if (ch === '"') inQuote = false
        else current += ch
      } else {
        if (ch === '"') inQuote = true
        else if (ch === ',') { result.push(current.trim()); current = '' }
        else current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
  return { headers, rows }
}

function autoMapColumns(headers: string[], columnMap: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {}
  const contactFields = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'notes', 'how_we_met', 'birthday', 'location', 'website', 'twitter_url', 'facebook_url', 'instagram_url', 'address', 'education']

  for (const h of headers) {
    if (columnMap[h]) { map[h] = columnMap[h]; continue }
    if (contactFields.includes(h)) { map[h] = h; continue }
    const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (lower.includes('first') && lower.includes('name')) map[h] = 'first_name'
    else if (lower.includes('last') && lower.includes('name')) map[h] = 'last_name'
    else if (lower === 'email' || lower === 'emailaddress' || lower === 'email1') map[h] = 'email'
    else if (lower === 'phone' || lower === 'phonenumber' || lower === 'phone1') map[h] = 'phone'
    else if (lower === 'company' || lower === 'organization' || lower === 'org') map[h] = 'company'
    else if (lower === 'title' || lower === 'jobtitle' || lower === 'position' || lower === 'role') map[h] = 'job_title'
    else if (lower.includes('linkedin')) map[h] = 'linkedin_url'
    else if (lower === 'notes' || lower === 'note') map[h] = 'notes'
    else if (lower === 'birthday' || lower === 'birthdate' || lower === 'dateofbirth') map[h] = 'birthday'
    else if (lower === 'location' || lower === 'city') map[h] = 'location'
    else if (lower.includes('howwemet') || lower === 'metvia' || lower === 'connectedon' || lower === 'source') map[h] = 'how_we_met'
    else if (lower === 'website' || lower === 'url' || lower === 'homepage') map[h] = 'website'
    else if (lower.includes('twitter') || lower === 'x') map[h] = 'twitter_url'
    else if (lower.includes('facebook')) map[h] = 'facebook_url'
    else if (lower.includes('instagram')) map[h] = 'instagram_url'
    else if (lower === 'address' || lower === 'streetaddress') map[h] = 'address'
    else if (lower === 'education' || lower === 'school' || lower === 'university') map[h] = 'education'
  }
  return map
}

const CONTACT_FIELDS = [
  { value: '', label: '-- Skip --' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
  { value: 'job_title', label: 'Job Title' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'notes', label: 'Notes' },
  { value: 'how_we_met', label: 'How We Met' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'location', label: 'Location' },
  { value: 'website', label: 'Website' },
  { value: 'twitter_url', label: 'Twitter URL' },
  { value: 'facebook_url', label: 'Facebook URL' },
  { value: 'instagram_url', label: 'Instagram URL' },
  { value: 'address', label: 'Address' },
  { value: 'education', label: 'Education' }
]

// ───────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString()
}

interface ConnectedSource {
  id: string
  name: string
  icon: string
  connected: boolean
  lastSync: string | null
  status: SourceStatus
}

export default function Import() {
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  // Connected platform states
  const [googleConnected, setGoogleConnected] = useState(false)
  const [microsoftConnected, setMicrosoftConnected] = useState(false)
  const [googleLastSync, setGoogleLastSync] = useState<string | null>(null)
  const [msLastSync, setMsLastSync] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [googleStatus, setGoogleStatus] = useState<SourceStatus>('not_connected')
  const [outlookStatus, setOutlookStatus] = useState<SourceStatus>('not_connected')

  // Import result overlay
  const [importResult, setImportResult] = useState<ImportResultData | null>(null)

  // CSV wizard state
  const [wizardStep, setWizardStep] = useState<'idle' | 'mapping' | 'preview' | 'importing'>('idle')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [detectedFormat, setDetectedFormat] = useState<{ format: DetectedFormat; label: string } | null>(null)
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('skip')

  // LinkedIn URL import
  const [linkedinUrls, setLinkedinUrls] = useState('')
  const [showLinkedinUrls, setShowLinkedinUrls] = useState(false)

  // Business card scanner
  const [showBusinessCard, setShowBusinessCard] = useState(false)
  const [businessCardText, setBusinessCardText] = useState('')

  // Instruction modal
  const [showInstructions, setShowInstructions] = useState<string | null>(null)

  // Connect flow modals
  const [showGmailFlow, setShowGmailFlow] = useState(false)
  const [showOutlookFlow, setShowOutlookFlow] = useState(false)

  useEffect(() => {
    loadStatuses()
  }, [])

  // Handle files dropped onto AppLayout
  useEffect(() => {
    const state = location.state as { droppedFilePath?: string; droppedFileName?: string } | null
    if (state?.droppedFilePath) {
      handleDroppedFile(state.droppedFilePath, state.droppedFileName || '')
      // Clear the state so it doesn't re-trigger
      navigate('/import', { replace: true, state: {} })
    }
  }, [location.state])

  async function handleDroppedFile(filePath: string, fileName: string) {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''

    // ZIP files — try all platform parsers
    if (ext === 'zip') {
      setLoading('zip')
      try {
        // Try Instagram first (most common ZIP import)
        let result = await window.api.data.importInstagramZip(filePath) as { imported: number; skipped: number; total: number }
        if (result.total > 0) {
          setImportResult({ source: 'Instagram', total: result.total, newContacts: result.imported, existing: 0, skipped: result.skipped })
          setLoading(null); return
        }
        // Try WhatsApp
        result = await window.api.data.importWhatsAppFile(filePath) as { imported: number; skipped: number; total: number }
        if (result.total > 0) {
          setImportResult({ source: 'WhatsApp', total: result.total, newContacts: result.imported, existing: 0, skipped: result.skipped })
          setLoading(null); return
        }
        // Try Telegram
        result = await window.api.data.importTelegramFile(filePath) as { imported: number; skipped: number; total: number }
        if (result.total > 0) {
          setImportResult({ source: 'Telegram', total: result.total, newContacts: result.imported, existing: 0, skipped: result.skipped })
          setLoading(null); return
        }
        toast('No contacts found in that ZIP file', 'error')
      } catch {
        toast('Could not read that ZIP file', 'error')
      }
      setLoading(null); return
    }

    // TXT files — try WhatsApp chat parser
    if (ext === 'txt') {
      setLoading('whatsapp')
      try {
        const result = await window.api.data.importWhatsAppFile(filePath) as { imported: number; skipped: number; total: number }
        if (result.total > 0) {
          setImportResult({ source: 'WhatsApp', total: result.total, newContacts: result.imported, existing: 0, skipped: result.skipped })
        } else {
          toast('No contacts found in that file', 'error')
        }
      } catch {
        toast('Could not read that file', 'error')
      }
      setLoading(null); return
    }

    // CSV, VCF, JSON — existing handler
    setLoading('csv')
    try {
      const content = await window.api.data.importReadFile(filePath) as string | null
      if (!content) { setLoading(null); return }

      // Handle VCF files
      if (content === '__VCF_EMPTY__') {
        toast('No contacts found in that file', 'error')
        setLoading(null); return
      }
      if (content.startsWith('__VCF_RESULT__')) {
        const result = JSON.parse(content.replace('__VCF_RESULT__', '')) as { imported: number; skipped: number; total: number }
        setImportResult({
          source: 'Phone Contacts',
          total: result.total,
          newContacts: result.imported,
          existing: 0,
          skipped: result.skipped
        })
        setLoading(null); return
      }

      // CSV file
      const { headers, rows } = parseCsv(content)
      if (rows.length === 0) {
        toast('No data found in that file', 'error')
        setLoading(null); return
      }
      const detected = detectFormat(headers)
      setDetectedFormat({ format: detected.format, label: detected.label })
      setCsvHeaders(headers)
      setCsvRows(rows)
      setColumnMap(autoMapColumns(headers, detected.columnMap))
      setWizardStep('mapping')
      toast(`Loaded ${fileName}`, 'success')
    } catch {
      toast('Could not read that file. Make sure it\'s a valid CSV or VCF file.', 'error')
    }
    setLoading(null)
  }

  async function loadStatuses() {
    try {
      const gs = await window.api.google.getStatus() as { connected?: boolean }
      const isConnected = !!gs?.connected
      setGoogleConnected(isConnected)
      setGoogleStatus(isConnected ? 'connected' : 'not_connected')
    } catch { /* ignore */ }

    try {
      const ms = await window.api.microsoft.getStatus() as { connected?: boolean }
      const isConnected = !!ms?.connected
      setMicrosoftConnected(isConnected)
      setOutlookStatus(isConnected ? 'connected' : 'not_connected')
    } catch { /* ignore */ }

    try {
      const s = await window.api.google.getAutoSyncStatus() as { lastSync?: string | null }
      setGoogleLastSync(s?.lastSync || null)
    } catch { /* ignore */ }

    try {
      const s = await window.api.microsoft.getContactsAutoSyncStatus() as { lastSync?: string | null }
      setMsLastSync(s?.lastSync || null)
    } catch { /* ignore */ }
  }

  // ── CSV Wizard ───────────────────────────────────

  async function handleCsvImport() {
    setLoading('csv')
    try {
      const content = await window.api.data.importSelectCsv() as string | null
      if (!content) { setLoading(null); return }

      // Handle VCF files (parsed server-side)
      if (content === '__VCF_EMPTY__') {
        toast('No contacts found in that file', 'error')
        setLoading(null); return
      }
      if (content.startsWith('__VCF_RESULT__')) {
        const result = JSON.parse(content.replace('__VCF_RESULT__', '')) as { imported: number; skipped: number; total: number }
        setImportResult({
          source: 'Phone Contacts',
          total: result.total,
          newContacts: result.imported,
          existing: 0,
          skipped: result.skipped
        })
        setLoading(null); return
      }

      const { headers, rows } = parseCsv(content)
      if (rows.length === 0) {
        toast('No data found in that file', 'error')
        setLoading(null); return
      }
      const detected = detectFormat(headers)
      setDetectedFormat({ format: detected.format, label: detected.label })
      setCsvHeaders(headers)
      setCsvRows(rows)
      setColumnMap(autoMapColumns(headers, detected.columnMap))
      setWizardStep('mapping')
    } catch (err) {
      toast('Could not read that file. Make sure it\'s a valid CSV or VCF file.', 'error')
    }
    setLoading(null)
  }

  async function handleExecuteImport() {
    setWizardStep('importing')
    try {
      const mapped = csvRows.map(row => {
        const obj: Record<string, string> = {}
        for (const [header, field] of Object.entries(columnMap)) {
          if (field && !field.startsWith('_') && row[header]) {
            if (obj[field]) obj[field] += '; ' + row[header]
            else obj[field] = row[header]
          }
        }
        return obj
      })

      const result = await window.api.data.importExecute(mapped, duplicateMode) as { imported?: number; skipped?: number; error?: string }
      if (result.error) {
        toast(`Import failed: ${result.error}`, 'error')
        resetWizard()
        return
      }
      setImportResult({
        source: detectedFormat?.label || 'CSV',
        total: csvRows.length,
        newContacts: result.imported || 0,
        existing: 0,
        skipped: result.skipped || 0
      })
      resetWizard()
    } catch {
      toast('Import failed. Please try again.', 'error')
      resetWizard()
    }
  }

  function resetWizard() {
    setWizardStep('idle')
    setCsvHeaders([])
    setCsvRows([])
    setColumnMap({})
    setDetectedFormat(null)
  }

  const mappedCount = Object.values(columnMap).filter(v => v && !v.startsWith('_')).length

  const previewRows = csvRows.slice(0, 5).map(row => {
    const obj: Record<string, string> = {}
    for (const [header, field] of Object.entries(columnMap)) {
      if (field && !field.startsWith('_') && row[header]) {
        if (obj[field]) obj[field] += '; ' + row[header]
        else obj[field] = row[header]
      }
    }
    return obj
  })
  const previewFields = [...new Set(Object.values(columnMap).filter(v => v && !v.startsWith('_')))]

  // ── Google handlers ──────────────────────────────

  async function handleGoogleConnect() {
    setGoogleStatus('connecting')
    try {
      const result = await window.api.google.connect() as { success?: boolean; error?: string }
      if (result?.success) {
        setGoogleConnected(true)
        setGoogleStatus('connected')
        toast('Gmail connected!')
        loadStatuses()
      } else {
        setGoogleStatus('error')
        toast(result?.error || 'Could not connect to Gmail. Try again.', 'error')
      }
    } catch {
      setGoogleStatus('error')
      toast('Could not connect to Gmail. Try again.', 'error')
    }
  }

  async function handleGoogleSync() {
    setLoading('google-sync')
    setGoogleStatus('syncing')
    try {
      const result = await window.api.google.runSync() as { success: boolean; imported?: number; updated?: number; skipped?: number; error?: string }
      if (result.success) {
        const total = (result.imported || 0) + (result.updated || 0) + (result.skipped || 0)
        if (total > 0) {
          setImportResult({
            source: 'Gmail',
            total,
            newContacts: result.imported || 0,
            existing: result.updated || 0,
            skipped: result.skipped || 0
          })
        } else {
          toast('Gmail is up to date — no new contacts found')
        }
        setGoogleLastSync(new Date().toISOString())
      } else {
        toast(result.error || 'Update failed. Try again.', 'error')
      }
      setGoogleStatus('connected')
    } catch {
      toast('Could not update from Gmail. Try again.', 'error')
      setGoogleStatus('connected')
    }
    setLoading(null)
  }

  async function handleGoogleContacts() {
    setLoading('google-contacts')
    try {
      const result = await importGoogleContacts()
      const imported = result.imported || 0
      const skipped = result.skipped || 0
      if (imported > 0) {
        setImportResult({
          source: 'Google Contacts',
          total: imported + skipped,
          newContacts: imported,
          existing: 0,
          skipped
        })
      } else {
        toast(`No new contacts found (${skipped} already in Nexus)`)
      }
    } catch {
      toast('Could not import Google contacts. Try again.', 'error')
    }
    setLoading(null)
  }

  async function handleGoogleCalendar() {
    setLoading('google-calendar')
    try {
      const result = await syncCalendarEvents()
      toast(`Found ${result.synced} events, matched ${result.matched} to contacts`)
    } catch {
      toast('Could not read calendar. Try again.', 'error')
    }
    setLoading(null)
  }

  // ── Microsoft handlers ───────────────────────────

  async function handleOutlookConnect() {
    setOutlookStatus('connecting')
    try {
      const result = await window.api.microsoft.connect() as { success?: boolean; error?: string }
      if (result?.success) {
        setMicrosoftConnected(true)
        setOutlookStatus('connected')
        toast('Outlook connected!')
        loadStatuses()
      } else {
        setOutlookStatus('error')
        toast(result?.error || 'Could not connect to Outlook. Try again.', 'error')
      }
    } catch {
      setOutlookStatus('error')
      toast('Could not connect to Outlook. Try again.', 'error')
    }
  }

  async function handleMsImportContacts() {
    setLoading('ms-contacts')
    try {
      const result = await window.api.microsoft.importContacts() as { success: boolean; imported?: number; updated?: number; skipped?: number; error?: string }
      if (result.success) {
        const total = (result.imported || 0) + (result.updated || 0) + (result.skipped || 0)
        if ((result.imported || 0) > 0) {
          setImportResult({
            source: 'Outlook',
            total,
            newContacts: result.imported || 0,
            existing: result.updated || 0,
            skipped: result.skipped || 0
          })
        } else {
          toast('Outlook is up to date — no new contacts found')
        }
        setMsLastSync(new Date().toISOString())
      } else {
        toast(result.error || 'Could not import. Try again.', 'error')
      }
    } catch {
      toast('Could not import Outlook contacts. Try again.', 'error')
    }
    setLoading(null)
  }

  // ── Phone / JSON handlers ────────────────────────

  async function handlePhoneContacts() {
    setLoading('phone')
    try {
      const result = await pickPhoneContacts()
      if (result.imported > 0) {
        setImportResult({
          source: 'Phone',
          total: result.imported + result.skipped,
          newContacts: result.imported,
          existing: 0,
          skipped: result.skipped
        })
      }
    } catch {
      toast('Could not import phone contacts. Try again.', 'error')
    }
    setLoading(null)
  }

  async function handleJsonImport(platform: 'facebook' | 'instagram') {
    setLoading(`json-${platform}`)
    try {
      const content = await window.api.data.importSelectCsv() as string | null
      if (!content) { setLoading(null); return }

      let contacts: { first_name: string; last_name: string; how_we_met: string }[] = []
      try {
        const data = JSON.parse(content)
        if (platform === 'facebook') {
          const friends = data.friends_v2 || data.friends || (Array.isArray(data) ? data : [])
          for (const friend of friends) {
            const name = friend.name || friend.title || ''
            if (!name) continue
            const parts = name.split(/\s+/)
            contacts.push({ first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '', how_we_met: 'Facebook' })
          }
        } else {
          const followers = data.relationships_followers || data.relationships_following || data
          const items = Array.isArray(followers) ? followers : []
          for (const item of items) {
            const username = item.string_list_data?.[0]?.value || item.value || item.username || ''
            if (!username) continue
            contacts.push({ first_name: username, last_name: '', how_we_met: 'Instagram' })
          }
        }
      } catch {
        toast('Could not read that file. Make sure you selected the right file from your data download.', 'error')
        setLoading(null)
        return
      }

      if (contacts.length === 0) {
        toast('No contacts found in that file', 'error')
        setLoading(null)
        return
      }

      const mapped = contacts.map(c => ({ first_name: c.first_name, last_name: c.last_name, how_we_met: c.how_we_met }))
      const result = await window.api.data.importExecute(mapped, 'skip') as { imported: number; skipped: number }
      const label = platform === 'facebook' ? 'Facebook' : 'Instagram'
      setImportResult({
        source: label,
        total: contacts.length,
        newContacts: result.imported,
        existing: 0,
        skipped: result.skipped
      })
      if (result.imported > 0) {
        await window.api.settings.set('has_imported', 'true')
      }
    } catch {
      toast('Import failed. Please try again.', 'error')
    }
    setLoading(null)
    setShowInstructions(null)
  }

  async function handlePlatformImport(platform: 'instagram' | 'whatsapp' | 'telegram') {
    setLoading(platform)
    try {
      const filePath = await window.api.data.selectPlatformFile(platform) as string | null
      if (!filePath) { setLoading(null); return }

      let result: { imported: number; skipped: number; total: number }
      if (platform === 'instagram') {
        result = await window.api.data.importInstagramZip(filePath) as { imported: number; skipped: number; total: number }
      } else if (platform === 'whatsapp') {
        result = await window.api.data.importWhatsAppFile(filePath) as { imported: number; skipped: number; total: number }
      } else {
        result = await window.api.data.importTelegramFile(filePath) as { imported: number; skipped: number; total: number }
      }

      if (result.total === 0) {
        toast('No contacts found in that file. Make sure you selected the right file from your data download.', 'error')
      } else {
        const labels = { instagram: 'Instagram', whatsapp: 'WhatsApp', telegram: 'Telegram' }
        setImportResult({
          source: labels[platform],
          total: result.total,
          newContacts: result.imported,
          existing: 0,
          skipped: result.skipped
        })
        if (result.imported > 0) {
          await window.api.settings.set('has_imported', 'true')
        }
      }
    } catch {
      toast('Could not read that file. Make sure it\'s the right format.', 'error')
    }
    setLoading(null)
  }

  async function handleBusinessCard() {
    if (!businessCardText.trim()) return
    setLoading('business-card')
    try {
      const contact = await window.api.data.importBusinessCardText(businessCardText) as Record<string, string>
      if (!contact.first_name && !contact.last_name) {
        toast('Could not find a name in that text. Try again with more details.', 'error')
        setLoading(null)
        return
      }
      const result = await window.api.data.importExecute([contact], 'skip') as { imported: number; skipped: number }
      if (result.imported > 0) {
        toast(`Added ${contact.first_name} ${contact.last_name}`.trim(), 'success')
        setShowBusinessCard(false)
        setBusinessCardText('')
      } else {
        toast('That contact already exists', 'error')
      }
    } catch {
      toast('Could not read that text. Try again.', 'error')
    }
    setLoading(null)
  }

  function handleLinkedinUrlOpen() {
    const urls = linkedinUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => /^https?:\/\/(www\.)?linkedin\.com\/in\//.test(u))
    if (urls.length === 0) {
      toast('No valid LinkedIn profile URLs found', 'error')
      return
    }
    for (const url of urls) {
      const separator = url.includes('?') ? '&' : '?'
      window.open(`${url}${separator}nexus_auto_save=true`, '_blank')
    }
    toast(`Opened ${urls.length} profile${urls.length > 1 ? 's' : ''} in browser`)
  }

  async function handleInteractionsCsvImport() {
    setLoading('csv-interactions')
    try {
      const content = await window.api.data.importSelectCsv() as string | null
      if (!content) { setLoading(null); return }
      const { rows } = parseCsv(content)
      if (rows.length === 0) {
        toast('No data found in that file', 'error')
        setLoading(null); return
      }
      const result = await window.api.data.importInteractions(rows) as { imported: number; skipped: number }
      toast(`Imported ${result.imported} interactions (${result.skipped} skipped — no matching contact)`)
    } catch {
      toast('Could not import interactions. Try again.', 'error')
    }
    setLoading(null)
  }

  const showPhoneContacts = !isElectron() && isContactPickerAvailable()

  // ── Build connected sources list for health header ──

  const connectedSources: ConnectedSource[] = []
  if (googleConnected) {
    connectedSources.push({ id: 'gmail', name: 'Gmail', icon: '\u{1F4E7}', connected: true, lastSync: googleLastSync, status: googleStatus })
  }
  if (microsoftConnected) {
    connectedSources.push({ id: 'outlook', name: 'Outlook', icon: '\u{1F4C5}', connected: true, lastSync: msLastSync, status: outlookStatus })
  }

  // ── Import Result Overlay ────────────────────────

  if (importResult) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-lg mx-auto mt-16">
          <ResultsScreen
            result={importResult}
            onViewContacts={() => { setImportResult(null); navigate('/contacts') }}
            onDone={() => setImportResult(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Your Network</h1>
          <p className="text-sm text-zinc-500 mt-1">Connect your accounts and import your contacts into Nexus</p>
        </div>

        {/* ── Network Health Header ── */}
        {connectedSources.length > 0 && (
          <div className="mb-8 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800/60">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Connected Sources</h2>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/40">
              {connectedSources.map(source => (
                <div key={source.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-lg">{source.icon}</span>
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 w-20">{source.name}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                  {source.lastSync && (
                    <span className="text-xs text-zinc-400">Last updated {formatRelativeTime(source.lastSync)}</span>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={source.id === 'gmail' ? handleGoogleSync : handleMsImportContacts}
                    disabled={loading === 'google-sync' || loading === 'ms-contacts'}
                    className="px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                  >
                    {(loading === 'google-sync' && source.id === 'gmail') || (loading === 'ms-contacts' && source.id === 'outlook')
                      ? 'Updating...'
                      : 'Update Now'
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CSV Wizard Overlay ── */}
        {wizardStep !== 'idle' && (
          <div className="mb-8 border border-violet-500/20 rounded-xl p-6 bg-violet-500/5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-violet-600 dark:text-violet-400">Import File</h2>
                {detectedFormat && (
                  <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full ${
                    detectedFormat.format === 'dex' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                    detectedFormat.format === 'clay' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                    detectedFormat.format === 'linkedin' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400' :
                    detectedFormat.format === 'nexus' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' :
                    'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                    {detectedFormat.label} format detected
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-500">{csvRows.length} contacts found</span>
            </div>

            {wizardStep === 'mapping' && (
              <>
                <p className="text-xs text-zinc-500 mb-4">
                  Match your file's columns to Nexus fields. We auto-detected {mappedCount} — adjust if needed.
                </p>
                <div className="space-y-2 mb-5 max-h-[300px] overflow-y-auto pr-2">
                  {csvHeaders.map(h => (
                    <div key={h} className="flex items-center gap-3">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 w-44 truncate flex-shrink-0" title={h}>{h}</span>
                      <svg className="w-4 h-4 text-zinc-400 dark:text-zinc-600 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10M10 5l3 3-3 3" /></svg>
                      <select
                        value={columnMap[h] || ''}
                        onChange={e => setColumnMap({ ...columnMap, [h]: e.target.value })}
                        className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50"
                      >
                        {CONTACT_FIELDS.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4 mb-5 border-t border-zinc-200/50 dark:border-zinc-800/50 pt-4">
                  <span className="text-xs font-medium text-zinc-500">If a contact already exists:</span>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input type="radio" name="dup" checked={duplicateMode === 'skip'} onChange={() => setDuplicateMode('skip')} className="accent-violet-500" /> Skip it
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input type="radio" name="dup" checked={duplicateMode === 'update'} onChange={() => setDuplicateMode('update')} className="accent-violet-500" /> Update it
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setWizardStep('preview')}
                    disabled={mappedCount === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Preview
                  </button>
                  <button onClick={resetWizard} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
                </div>
              </>
            )}

            {wizardStep === 'preview' && (
              <>
                <p className="text-xs text-zinc-500 mb-3">Here's how the first 5 rows will look in Nexus:</p>
                <div className="overflow-x-auto mb-5 border border-zinc-200/50 dark:border-zinc-800/40 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/50">
                        {previewFields.map(f => (
                          <th key={f} className="text-left px-3 py-2 font-medium text-zinc-500 whitespace-nowrap">{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri} className="border-t border-zinc-200/30 dark:border-zinc-800/30">
                          {previewFields.map(f => (
                            <td key={f} className="px-3 py-2 text-zinc-700 dark:text-zinc-300 truncate max-w-[180px]">{row[f] || ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleExecuteImport}
                    className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">
                    Import {csvRows.length} Contacts
                  </button>
                  <button onClick={() => setWizardStep('mapping')} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Back</button>
                  <button onClick={resetWizard} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
                </div>
              </>
            )}

            {wizardStep === 'importing' && (
              <div className="flex items-center gap-3 py-4">
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Adding {csvRows.length} contacts...</span>
              </div>
            )}
          </div>
        )}

        {/* ── Source Card Grid ── */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            {connectedSources.length > 0 ? 'Add Another Source' : 'Connect Your Sources'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Gmail */}
            <SourceCard
              icon={<span>{'\u{1F4E7}'}</span>}
              name="Gmail"
              description="Find contacts from your email history"
              status={googleStatus}
              lastSync={googleLastSync}
              onAction={googleConnected ? handleGoogleSync : () => setShowGmailFlow(true)}
              actionLabel={googleConnected ? undefined : 'Connect Gmail'}
              onSecondaryAction={googleConnected ? handleGoogleContacts : undefined}
              secondaryLabel={googleConnected ? 'Full Import' : undefined}
              disabled={loading === 'google-sync' || loading === 'google-contacts'}
            />

            {/* Outlook */}
            <SourceCard
              icon={<span>{'\u{1F4C5}'}</span>}
              name="Outlook"
              description="Find contacts from your email and calendar"
              status={outlookStatus}
              lastSync={msLastSync}
              onAction={microsoftConnected ? handleMsImportContacts : () => setShowOutlookFlow(true)}
              disabled={loading === 'ms-contacts'}
            />

            {/* LinkedIn */}
            <SourceCard
              icon={<span>{'\u{1F4BC}'}</span>}
              name="LinkedIn"
              description="Import your connections via CSV export"
              status="not_connected"
              actionLabel="How to Import"
              onAction={() => setShowInstructions('linkedin')}
            />

            {/* CSV / Any File */}
            <SourceCard
              icon={<span>{'\u{1F4C4}'}</span>}
              name="Any File"
              description="CSV, JSON, or VCard. Auto-detects Dex, Clay, LinkedIn formats."
              status="not_connected"
              actionLabel="Upload File"
              onAction={handleCsvImport}
              disabled={loading === 'csv' || wizardStep !== 'idle'}
            />

            {/* Instagram */}
            <SourceCard
              icon={<span>{'\u{1F4F7}'}</span>}
              name="Instagram"
              description="Add people you follow from your data download"
              status="not_connected"
              actionLabel="Upload ZIP"
              onAction={() => handlePlatformImport('instagram')}
              disabled={loading === 'instagram'}
              onSecondaryAction={() => setShowInstructions('instagram')}
              secondaryLabel="How to get file"
            />

            {/* Facebook */}
            <SourceCard
              icon={<span>{'\u{1F465}'}</span>}
              name="Facebook"
              description="Import your Facebook friends"
              status="not_connected"
              actionLabel="How to Import"
              onAction={() => setShowInstructions('facebook')}
            />

            {/* Phone Contacts (PWA only) */}
            {showPhoneContacts && (
              <SourceCard
                icon={<span>{'\u{1F4F1}'}</span>}
                name="Phone Contacts"
                description="Select contacts from your phone"
                status="not_connected"
                actionLabel="Import Contacts"
                onAction={handlePhoneContacts}
                disabled={loading === 'phone'}
              />
            )}

            {/* WhatsApp */}
            <SourceCard
              icon={<span>{'\u{1F4AC}'}</span>}
              name="WhatsApp"
              description="Add contacts from a chat export or data download"
              status="not_connected"
              actionLabel="Upload File"
              onAction={() => handlePlatformImport('whatsapp')}
              disabled={loading === 'whatsapp'}
            />

            {/* Telegram */}
            <SourceCard
              icon={<span>{'\u2708\uFE0F'}</span>}
              name="Telegram"
              description="Add contacts from your Telegram data export"
              status="not_connected"
              actionLabel="Upload File"
              onAction={() => handlePlatformImport('telegram')}
              disabled={loading === 'telegram'}
            />
          </div>
        </div>

        {/* ── Additional Tools Section ── */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">More Tools</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* LinkedIn URL Import */}
            <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl bg-white dark:bg-zinc-900/50 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 bg-zinc-50 dark:bg-zinc-800/50">
                  {'\u{1F517}'}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">LinkedIn Profile URLs</h3>
                  <p className="text-sm text-zinc-500">Paste URLs to open and save with the Nexus extension</p>
                </div>
              </div>
              {showLinkedinUrls ? (
                <>
                  <textarea
                    value={linkedinUrls}
                    onChange={e => setLinkedinUrls(e.target.value)}
                    placeholder={'https://www.linkedin.com/in/johndoe\nhttps://www.linkedin.com/in/janedoe'}
                    rows={3}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 resize-none mb-3 font-mono text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={handleLinkedinUrlOpen} disabled={!linkedinUrls.trim()}
                      className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      Open in Browser
                    </button>
                    <button onClick={() => setShowLinkedinUrls(false)} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Cancel</button>
                  </div>
                </>
              ) : (
                <button onClick={() => setShowLinkedinUrls(true)}
                  className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors">
                  Paste URLs
                </button>
              )}
            </div>

            {/* Calendar Sync (Google) */}
            {googleConnected && (
              <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl bg-white dark:bg-zinc-900/50 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 bg-zinc-50 dark:bg-zinc-800/50">
                    {'\u{1F4C5}'}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Google Calendar</h3>
                    <p className="text-sm text-zinc-500">Import calendar events as interactions</p>
                  </div>
                </div>
                <button onClick={handleGoogleCalendar} disabled={loading === 'google-calendar'}
                  className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50">
                  {loading === 'google-calendar' ? 'Checking...' : 'Check Calendar'}
                </button>
              </div>
            )}

            {/* CSV Interactions */}
            <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl bg-white dark:bg-zinc-900/50 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 bg-zinc-50 dark:bg-zinc-800/50">
                  {'\u{1F4DD}'}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Import Interactions</h3>
                  <p className="text-sm text-zinc-500">Import notes and interactions from a CSV file</p>
                </div>
              </div>
              <button onClick={handleInteractionsCsvImport} disabled={loading === 'csv-interactions' || wizardStep !== 'idle'}
                className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50">
                {loading === 'csv-interactions' ? 'Importing...' : 'Upload CSV'}
              </button>
            </div>
            {/* Business Card Scanner */}
            <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl bg-white dark:bg-zinc-900/50 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 bg-zinc-50 dark:bg-zinc-800/50">
                  {'\u{1F4C7}'}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Business Card</h3>
                  <p className="text-sm text-zinc-500">Type or paste text from a business card</p>
                </div>
              </div>
              {showBusinessCard ? (
                <>
                  <textarea
                    value={businessCardText}
                    onChange={e => setBusinessCardText(e.target.value)}
                    placeholder={'John Smith\nVP of Engineering\nAcme Corp\njohn@acme.com\n+1 (555) 123-4567\nwww.acme.com'}
                    rows={5}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 resize-none mb-3 font-mono text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={handleBusinessCard} disabled={!businessCardText.trim() || loading === 'business-card'}
                      className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading === 'business-card' ? 'Reading...' : 'Add Contact'}
                    </button>
                    <button onClick={() => { setShowBusinessCard(false); setBusinessCardText('') }} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Cancel</button>
                  </div>
                </>
              ) : (
                <button onClick={() => setShowBusinessCard(true)}
                  className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors">
                  Type or Paste
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Instruction Modal ── */}
      {showInstructions && (
        <InstructionModal
          platform={showInstructions}
          onClose={() => setShowInstructions(null)}
          onCsvImport={() => { setShowInstructions(null); handleCsvImport() }}
          onJsonImport={(p) => handleJsonImport(p)}
          loading={loading}
        />
      )}

      {/* ── Gmail Connect Flow ── */}
      {showGmailFlow && (
        <GmailConnectFlow
          onClose={() => setShowGmailFlow(false)}
          onComplete={() => { setShowGmailFlow(false); loadStatuses() }}
        />
      )}

      {/* ── Outlook Connect Flow ── */}
      {showOutlookFlow && (
        <OutlookConnectFlow
          onClose={() => setShowOutlookFlow(false)}
          onComplete={() => { setShowOutlookFlow(false); loadStatuses() }}
        />
      )}
    </div>
  )
}

// ─── Instruction Modal (extracted for clarity) ─────

const PLATFORM_GUIDES: Record<string, {
  name: string; icon: string; steps: string[]
  link?: string; jsonSupported?: boolean
}> = {
  linkedin: {
    name: 'LinkedIn',
    icon: '\u{1F4BC}',
    steps: [
      'Go to linkedin.com and click your profile picture',
      'Go to Settings > Data privacy > Get a copy of your data',
      'Select "Connections" and request your data',
      'Wait for LinkedIn\'s email with the download link',
      'Download and unzip the file',
      'Find "Connections.csv" inside and import it below'
    ]
  },
  instagram: {
    name: 'Instagram',
    icon: '\u{1F4F7}',
    link: 'https://accountscenter.instagram.com/info_and_permissions/dyi/',
    jsonSupported: true,
    steps: [
      'Open Instagram Settings on your phone',
      'Go to Account > Download Your Information',
      'Select "Some of your information"',
      'Choose "Followers and Following"',
      'Pick JSON format, then tap "Create Files"',
      'Wait for Instagram\'s email, download the ZIP',
      'Upload the ZIP file directly — or open it and import the JSON file'
    ]
  },
  facebook: {
    name: 'Facebook',
    icon: '\u{1F465}',
    link: 'https://accountscenter.facebook.com/info_and_permissions/dyi/',
    jsonSupported: true,
    steps: [
      'Open the link below to go to Facebook\'s data download page',
      'Select your Facebook account',
      'Choose JSON format',
      'Under "Select information", pick "Friends"',
      'Click "Create File" and wait for the email',
      'Download the ZIP and find friends.json inside',
      'Import the JSON file below'
    ]
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: '\u{1F4AC}',
    steps: [
      'Open WhatsApp on your phone',
      'Open any chat, tap the menu (...) and choose "Export Chat"',
      'Choose "Without media" to keep the file small',
      'Save the .txt file to your computer',
      'Upload it here — Nexus will find contact names automatically'
    ]
  },
  telegram: {
    name: 'Telegram',
    icon: '\u2708\uFE0F',
    steps: [
      'Open Telegram Desktop on your computer',
      'Go to Settings > Advanced > Export Telegram Data',
      'Select "Contacts" (you can uncheck everything else)',
      'Choose "Machine-readable JSON" as the format',
      'Click "Export" and wait for it to finish',
      'Upload the result.json or the ZIP file here'
    ]
  }
}

function InstructionModal({ platform, onClose, onCsvImport, onJsonImport, loading }: {
  platform: string
  onClose: () => void
  onCsvImport: () => void
  onJsonImport: (p: 'facebook' | 'instagram') => void
  loading: string | null
}) {
  const info = PLATFORM_GUIDES[platform]
  if (!info) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{info.icon}</span>
            <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
              Import from {info.name}
            </h2>
          </div>
          <button onClick={onClose}
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-lg">
            &times;
          </button>
        </div>

        <ol className="space-y-3 mb-6">
          {info.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center text-[10px] font-bold">
                {i + 1}
              </span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        {info.link && (
          <a href={info.link} target="_blank" rel="noreferrer"
            className="block w-full px-4 py-2.5 mb-3 text-sm font-medium text-center text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors">
            Open Data Download Page
          </a>
        )}

        <div className="flex gap-2">
          <button onClick={onCsvImport}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">
            Import CSV
          </button>
          {info.jsonSupported && (
            <button
              onClick={() => onJsonImport(platform as 'facebook' | 'instagram')}
              disabled={loading === `json-${platform}`}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50">
              {loading === `json-${platform}` ? 'Importing...' : 'Import JSON'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
