import type { LinkedInProfile } from './lib/types'

// View management
const views = {
  loading: document.getElementById('view-loading')!,
  setup: document.getElementById('view-setup')!,
  login: document.getElementById('view-login')!,
  main: document.getElementById('view-main')!,
}

function showView(name: keyof typeof views): void {
  Object.values(views).forEach(v => v.classList.add('hidden'))
  views[name].classList.remove('hidden')
}

// Setup form
document.getElementById('setup-form')!.addEventListener('submit', async (e) => {
  e.preventDefault()
  const url = (document.getElementById('setup-url') as HTMLInputElement).value
  const key = (document.getElementById('setup-key') as HTMLInputElement).value
  const errorEl = document.getElementById('setup-error')!

  try {
    await chrome.runtime.sendMessage({ type: 'CONFIGURE', url, anonKey: key })
    errorEl.classList.add('hidden')
    await init()
  } catch {
    errorEl.textContent = 'Failed to configure'
    errorEl.classList.remove('hidden')
  }
})

// Login form
document.getElementById('login-form')!.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email = (document.getElementById('login-email') as HTMLInputElement).value
  const password = (document.getElementById('login-password') as HTMLInputElement).value
  const errorEl = document.getElementById('login-error')!
  const submitBtn = (e.target as HTMLFormElement).querySelector('button[type="submit"]') as HTMLButtonElement

  submitBtn.disabled = true
  submitBtn.textContent = 'Signing in...'

  try {
    const result = await chrome.runtime.sendMessage({ type: 'LOGIN', email, password })
    if (result.success) {
      errorEl.classList.add('hidden')
      await init()
    } else {
      errorEl.textContent = result.error || 'Login failed'
      errorEl.classList.remove('hidden')
    }
  } catch {
    errorEl.textContent = 'Connection error'
    errorEl.classList.remove('hidden')
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Sign In'
  }
})

// Logout
document.getElementById('btn-logout')!.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'LOGOUT' })
  showView('login')
})

// Quick Add toggle
document.getElementById('btn-quick-add')!.addEventListener('click', () => {
  document.getElementById('quick-add-form')!.classList.toggle('hidden')
})

document.getElementById('btn-cancel-qa')!.addEventListener('click', () => {
  document.getElementById('quick-add-form')!.classList.add('hidden')
})

// Quick Add form submit
document.getElementById('qa-form')!.addEventListener('submit', async (e) => {
  e.preventDefault()

  const profile: LinkedInProfile = {
    firstName: (document.getElementById('qa-first') as HTMLInputElement).value,
    lastName: (document.getElementById('qa-last') as HTMLInputElement).value,
    headline: '',
    company: (document.getElementById('qa-company') as HTMLInputElement).value,
    jobTitle: '',
    location: '',
    photoUrl: '',
    linkedinUrl: '',
    connectionDegree: '',
  }

  const result = await chrome.runtime.sendMessage({ type: 'SAVE_CONTACT', data: profile })
  if (result.success) {
    ;(document.getElementById('qa-form') as HTMLFormElement).reset()
    document.getElementById('quick-add-form')!.classList.add('hidden')

    const btn = document.getElementById('btn-quick-add')!
    btn.textContent = 'Saved!'
    btn.classList.add('btn-primary')
    btn.classList.remove('btn-outline')
    setTimeout(() => {
      btn.textContent = 'Quick Add Contact'
      btn.classList.remove('btn-primary')
      btn.classList.add('btn-outline')
    }, 2000)
  }
})

// Note form
document.getElementById('btn-add-note')!.addEventListener('click', () => {
  document.getElementById('note-form')!.classList.remove('hidden')
  document.getElementById('reminder-form')!.classList.add('hidden')
})

document.getElementById('btn-cancel-note')!.addEventListener('click', () => {
  document.getElementById('note-form')!.classList.add('hidden')
})

document.getElementById('btn-save-note')!.addEventListener('click', async () => {
  const text = (document.getElementById('note-text') as HTMLTextAreaElement).value
  const contactId = document.getElementById('contact-card')!.dataset.contactId
  if (!text || !contactId) return

  const btn = document.getElementById('btn-save-note') as HTMLButtonElement
  btn.disabled = true
  btn.textContent = 'Saving...'

  const result = await chrome.runtime.sendMessage({
    type: 'CREATE_INTERACTION',
    contactId,
    description: text,
  })

  if (result.success) {
    ;(document.getElementById('note-text') as HTMLTextAreaElement).value = ''
    document.getElementById('note-form')!.classList.add('hidden')
  }

  btn.disabled = false
  btn.textContent = 'Save'
})

// Reminder form
document.getElementById('btn-set-reminder')!.addEventListener('click', () => {
  document.getElementById('reminder-form')!.classList.remove('hidden')
  document.getElementById('note-form')!.classList.add('hidden')

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  ;(document.getElementById('reminder-date') as HTMLInputElement).value = tomorrow.toISOString().split('T')[0]
})

document.getElementById('btn-cancel-reminder')!.addEventListener('click', () => {
  document.getElementById('reminder-form')!.classList.add('hidden')
})

document.getElementById('btn-save-reminder')!.addEventListener('click', async () => {
  const message = (document.getElementById('reminder-message') as HTMLInputElement).value
  const dueDate = (document.getElementById('reminder-date') as HTMLInputElement).value
  const contactId = document.getElementById('contact-card')!.dataset.contactId
  if (!message || !dueDate || !contactId) return

  const btn = document.getElementById('btn-save-reminder') as HTMLButtonElement
  btn.disabled = true
  btn.textContent = 'Saving...'

  const result = await chrome.runtime.sendMessage({
    type: 'CREATE_REMINDER',
    contactId,
    message,
    dueDate,
  })

  if (result.success) {
    ;(document.getElementById('reminder-message') as HTMLInputElement).value = ''
    document.getElementById('reminder-form')!.classList.add('hidden')
  }

  btn.disabled = false
  btn.textContent = 'Save'
})

// Save from popup (when on LinkedIn profile but contact not saved)
document.getElementById('btn-save-from-popup')!.addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-from-popup') as HTMLButtonElement
  btn.disabled = true
  btn.textContent = 'Saving...'

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    const profile = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PROFILE' })
    if (!profile) return

    const result = await chrome.runtime.sendMessage({ type: 'SAVE_CONTACT', data: profile })
    if (result.success) {
      btn.textContent = 'Saved!'
      setTimeout(() => loadContactForCurrentTab(), 500)
    } else {
      btn.textContent = result.error || 'Error'
      setTimeout(() => {
        btn.disabled = false
        btn.textContent = 'Save to Nexus'
      }, 2000)
    }
  } catch {
    btn.textContent = 'Error'
    setTimeout(() => {
      btn.disabled = false
      btn.textContent = 'Save to Nexus'
    }, 2000)
  }
})

// Load contact info for current tab
async function loadContactForCurrentTab(): Promise<void> {
  const contactSection = document.getElementById('contact-section')!
  const noProfileSection = document.getElementById('no-profile-section')!
  const contactCard = document.getElementById('contact-card')!
  const contactNotSaved = document.getElementById('contact-not-saved')!

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.url || !tab.url.includes('linkedin.com/in/')) {
      contactSection.classList.add('hidden')
      noProfileSection.classList.remove('hidden')
      return
    }

    contactSection.classList.remove('hidden')
    noProfileSection.classList.add('hidden')

    // Clean URL
    let url = tab.url.replace(/\?.*$/, '').replace(/\/+$/, '').replace(/\/overlay\/.*$/, '')

    const result = await chrome.runtime.sendMessage({
      type: 'GET_CONTACT_BY_LINKEDIN_URL',
      url,
    })

    if (result?.contact) {
      contactCard.classList.remove('hidden')
      contactNotSaved.classList.add('hidden')
      contactCard.dataset.contactId = result.contact.id

      const contact = result.contact
      document.getElementById('contact-name')!.textContent =
        `${contact.first_name} ${contact.last_name}`
      document.getElementById('contact-title')!.textContent =
        [contact.job_title, contact.company].filter(Boolean).join(' at ')

      const photo = document.getElementById('contact-photo') as HTMLImageElement
      if (contact.photo_url) {
        photo.src = contact.photo_url
        photo.classList.remove('hidden')
      } else {
        photo.classList.add('hidden')
      }

      const details = document.getElementById('contact-details')!
      const parts: string[] = []
      if (contact.email) parts.push(`Email: ${contact.email}`)
      if (contact.phone) parts.push(`Phone: ${contact.phone}`)
      if (contact.notes) {
        const preview = contact.notes.length > 100
          ? contact.notes.substring(0, 100) + '...'
          : contact.notes
        parts.push(`Notes: ${preview}`)
      }
      details.innerHTML = parts.map(d => `<p>${escapeHtml(d)}</p>`).join('')
    } else {
      contactCard.classList.add('hidden')
      contactNotSaved.classList.remove('hidden')
    }
  } catch {
    contactSection.classList.add('hidden')
    noProfileSection.classList.remove('hidden')
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Initialize
async function init(): Promise<void> {
  showView('loading')

  try {
    const configResult = await chrome.runtime.sendMessage({ type: 'CHECK_CONFIGURED' })
    if (!configResult.configured) {
      showView('setup')
      return
    }

    const authResult = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' })
    if (!authResult.isAuthenticated) {
      showView('login')
      return
    }

    document.getElementById('user-email')!.textContent = authResult.email || ''
    showView('main')
    await loadContactForCurrentTab()
  } catch {
    showView('setup')
  }
}

init()
