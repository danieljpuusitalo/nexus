import type { LinkedInProfile } from './lib/types'

// ============================================================
// LinkedIn Profile Data Extractor (Task 3.2)
// ============================================================

function extractText(selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el?.textContent?.trim()) return el.textContent.trim()
  }
  return ''
}

function extractName(): { firstName: string; lastName: string } {
  const nameSelectors = [
    'h1.text-heading-xlarge',
    '.pv-top-card h1',
    'h1[class*="text-heading"]',
    '.ph5 h1',
    '.pv-text-details__left-panel h1',
  ]

  const fullName = extractText(nameSelectors)
  if (fullName) {
    const parts = fullName.split(/\s+/)
    if (parts.length >= 2) {
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
    }
    return { firstName: fullName, lastName: '' }
  }

  return { firstName: '', lastName: '' }
}

function extractHeadline(): string {
  return extractText([
    '.text-body-medium[data-generated-suggestion-target]',
    '.pv-top-card .text-body-medium',
    '.ph5 .text-body-medium',
    '.pv-text-details__left-panel .text-body-medium',
    '[data-anonymize="headline-text"]',
  ])
}

function extractCurrentPosition(): { company: string; jobTitle: string } {
  let company = ''
  let jobTitle = ''

  // Strategy 1: Experience section first entry
  const expItems = document.querySelectorAll(
    '#experience ~ .pvs-list__container .pvs-entity--padded, ' +
    '#experience ~ div .pvs-entity--padded, ' +
    'section:has(#experience) .pvs-entity--padded'
  )

  if (expItems.length > 0) {
    const firstExp = expItems[0]
    const spans = firstExp.querySelectorAll('span[aria-hidden="true"]')
    if (spans.length >= 2) {
      jobTitle = spans[0]?.textContent?.trim() ?? ''
      const companyText = spans[1]?.textContent?.trim() ?? ''
      company = companyText.split('·')[0].trim()
    }
  }

  // Strategy 2: Top card current position text
  if (!company) {
    const topCardCompany = extractText([
      '.pv-top-card .inline-show-more-text',
      '.pv-text-details__right-panel .text-body-small',
      'div[data-anonymize="company-name"]',
    ])
    if (topCardCompany) {
      company = topCardCompany.split('·')[0].trim()
    }
  }

  // Strategy 3: Parse headline for "Title at Company" pattern
  if (!company && !jobTitle) {
    const headline = extractHeadline()
    const atMatch = headline.match(/^(.+?)\s+at\s+(.+)$/i)
    if (atMatch) {
      jobTitle = atMatch[1].trim()
      company = atMatch[2].trim()
    }
  }

  return { company, jobTitle }
}

function extractLocation(): string {
  return extractText([
    '.pv-top-card .text-body-small.t-black--light',
    '.pv-text-details__left-panel .text-body-small.t-black--light',
    '.ph5 .text-body-small',
    'span[class*="t-black--light"][class*="text-body-small"]',
  ])
}

function extractPhotoUrl(): string {
  const selectors = [
    '.pv-top-card-profile-picture__image--show',
    'img.pv-top-card-profile-picture__image',
    'img[class*="pv-top-card-profile-picture"]',
    '.presence-entity__image',
  ]

  for (const sel of selectors) {
    const img = document.querySelector(sel) as HTMLImageElement | null
    if (img?.src && !img.src.includes('ghost-person') && !img.src.includes('data:image')) {
      return img.src
    }
  }
  return ''
}

function extractConnectionDegree(): string {
  const selectors = [
    '.dist-value',
    '.pv-top-card .pvs-header__subtitle span',
    'span[class*="distance-badge"]',
  ]

  const text = extractText(selectors)
  const match = text.match(/(1st|2nd|3rd)/i)
  return match ? match[1] : ''
}

function cleanLinkedInUrl(url: string): string {
  try {
    const parsed = new URL(url)
    let path = parsed.pathname.replace(/\/+$/, '')
    path = path.replace(/\/overlay\/.*$/, '')
    return `https://www.linkedin.com${path}`
  } catch {
    return url
  }
}

function extractProfile(): LinkedInProfile {
  const { firstName, lastName } = extractName()
  const { company, jobTitle } = extractCurrentPosition()

  return {
    firstName,
    lastName,
    headline: extractHeadline(),
    company,
    jobTitle,
    location: extractLocation(),
    photoUrl: extractPhotoUrl(),
    linkedinUrl: cleanLinkedInUrl(window.location.href),
    connectionDegree: extractConnectionDegree(),
  }
}

// Listen for extraction requests from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_PROFILE') {
    sendResponse(extractProfile())
  }
  return false
})

// ============================================================
// "Save to Nexus" Button Overlay (Task 3.3)
// ============================================================

let buttonContainer: HTMLDivElement | null = null
let currentUrl = ''

function createButton(): void {
  if (buttonContainer) return

  buttonContainer = document.createElement('div')
  buttonContainer.id = 'nexus-save-button'
  buttonContainer.innerHTML = `
    <button id="nexus-btn" class="nexus-btn nexus-btn-save">
      <svg class="nexus-btn-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd"/>
      </svg>
      <span class="nexus-btn-label">Save to Nexus</span>
    </button>
  `
  document.body.appendChild(buttonContainer)

  document.getElementById('nexus-btn')?.addEventListener('click', handleSaveClick)

  checkExistingContact()
}

async function checkExistingContact(): Promise<void> {
  const url = cleanLinkedInUrl(window.location.href)
  const btn = document.getElementById('nexus-btn')
  const label = btn?.querySelector('.nexus-btn-label')
  if (!btn || !label) return

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CONTACT_BY_LINKEDIN_URL',
      url,
    })

    if (response?.contact) {
      btn.classList.remove('nexus-btn-save')
      btn.classList.add('nexus-btn-saved')
      label.textContent = 'In Nexus'
      btn.dataset.state = 'saved'
      btn.dataset.contactId = response.contact.id

      // Job change detection (Task 3.7)
      detectJobChange(response.contact)
    }
  } catch {
    // Extension context invalidated — ignore
  }
}

// ============================================================
// Job Change Detection (Task 3.7)
// ============================================================

async function detectJobChange(savedContact: Record<string, string>): Promise<void> {
  const profile = extractProfile()
  const changes: string[] = []

  if (profile.company && savedContact.company && profile.company !== savedContact.company) {
    changes.push(`Company changed: "${savedContact.company}" → "${profile.company}"`)
  }
  if (profile.jobTitle && savedContact.job_title && profile.jobTitle !== savedContact.job_title) {
    changes.push(`Title changed: "${savedContact.job_title}" → "${profile.jobTitle}"`)
  }

  if (changes.length === 0) return

  // Notify background to log the change
  try {
    await chrome.runtime.sendMessage({
      type: 'JOB_CHANGE_DETECTED',
      contactId: savedContact.id,
      contactName: `${savedContact.first_name} ${savedContact.last_name}`,
      changes,
      newCompany: profile.company,
      newJobTitle: profile.jobTitle,
    })
  } catch {
    // Ignore errors
  }
}

async function handleSaveClick(): Promise<void> {
  const btn = document.getElementById('nexus-btn')
  const label = btn?.querySelector('.nexus-btn-label')
  if (!btn || !label) return

  if (btn.dataset.state === 'saved') return

  // Check auth first
  try {
    const authResponse = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' })
    if (!authResponse?.isAuthenticated) {
      label.textContent = 'Sign in first'
      btn.classList.add('nexus-btn-error')
      setTimeout(() => {
        label.textContent = 'Save to Nexus'
        btn.classList.remove('nexus-btn-error')
      }, 2000)
      return
    }
  } catch {
    label.textContent = 'Error'
    setTimeout(() => { label.textContent = 'Save to Nexus' }, 2000)
    return
  }

  // Extract profile and save
  label.textContent = 'Saving...'
  btn.classList.add('nexus-btn-loading')

  try {
    const profile = extractProfile()
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_CONTACT',
      data: profile,
    })

    if (response?.success) {
      btn.classList.remove('nexus-btn-loading', 'nexus-btn-save')
      btn.classList.add('nexus-btn-saved')
      label.textContent = response.updated ? 'Updated' : 'Saved'
      btn.dataset.state = 'saved'
      btn.dataset.contactId = response.contactId
    } else {
      btn.classList.remove('nexus-btn-loading')
      btn.classList.add('nexus-btn-error')
      label.textContent = response?.error || 'Error'
      setTimeout(() => {
        label.textContent = 'Save to Nexus'
        btn.classList.remove('nexus-btn-error')
      }, 3000)
    }
  } catch {
    btn.classList.remove('nexus-btn-loading')
    btn.classList.add('nexus-btn-error')
    label.textContent = 'Error'
    setTimeout(() => {
      label.textContent = 'Save to Nexus'
      btn.classList.remove('nexus-btn-error')
    }, 3000)
  }
}

// LinkedIn is an SPA — watch for navigation changes
function watchNavigation(): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const observer = new MutationObserver(() => {
    const newUrl = window.location.href
    if (newUrl !== currentUrl) {
      currentUrl = newUrl
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (isProfilePage()) {
          buttonContainer?.remove()
          buttonContainer = null
          createButton()
        } else {
          buttonContainer?.remove()
          buttonContainer = null
        }
      }, 1000)
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

function isProfilePage(): boolean {
  return /linkedin\.com\/in\/[^/]+/.test(window.location.href)
}

// Check for nexus_auto_save=true URL param (from LinkedIn URL import feature)
function checkAutoSave(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('nexus_auto_save') === 'true') {
      // Auto-trigger save after a delay to let the page load
      setTimeout(() => {
        const btn = document.getElementById('nexus-btn')
        if (btn && btn.dataset.state !== 'saved') {
          btn.click()
        }
      }, 2000)
    }
  } catch {
    // URL params may be stripped by LinkedIn — no-op
  }
}

// Initialize
currentUrl = window.location.href
if (isProfilePage()) {
  if (document.readyState === 'complete') {
    setTimeout(() => { createButton(); checkAutoSave() }, 500)
  } else {
    window.addEventListener('load', () => setTimeout(() => { createButton(); checkAutoSave() }, 500))
  }
}
watchNavigation()
