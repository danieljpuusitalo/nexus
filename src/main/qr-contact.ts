/**
 * QR Code Contact Card
 *
 * Generates QR codes containing contact information in vCard format.
 * The QR code can be scanned by any phone camera to add the contact.
 */

import QRCode from 'qrcode'

interface ContactForQR {
  first_name: string
  last_name: string
  email?: string
  phone?: string
  company?: string
  job_title?: string
  website?: string
  linkedin_url?: string
}

function escapeVCard(str: string): string {
  return str.replace(/[\\;,]/g, c => '\\' + c)
}

export function contactToVCard(contact: ContactForQR): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVCard(contact.last_name || '')};${escapeVCard(contact.first_name || '')};;;`,
    `FN:${escapeVCard(`${contact.first_name || ''} ${contact.last_name || ''}`.trim())}`,
  ]

  if (contact.email) {
    lines.push(`EMAIL:${contact.email}`)
  }
  if (contact.phone) {
    lines.push(`TEL:${contact.phone}`)
  }
  if (contact.company) {
    lines.push(`ORG:${escapeVCard(contact.company)}`)
  }
  if (contact.job_title) {
    lines.push(`TITLE:${escapeVCard(contact.job_title)}`)
  }
  if (contact.website) {
    lines.push(`URL:${contact.website}`)
  }
  if (contact.linkedin_url) {
    lines.push(`URL:${contact.linkedin_url}`)
  }

  lines.push('END:VCARD')
  return lines.join('\r\n')
}

export async function generateContactQR(contact: ContactForQR): Promise<string> {
  const vcard = contactToVCard(contact)
  // Generate as data URL (base64 PNG)
  const dataUrl = await QRCode.toDataURL(vcard, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  })
  return dataUrl
}
