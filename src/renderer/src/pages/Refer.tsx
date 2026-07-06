import { useEffect, useState } from 'react'

interface ReferralStats {
  referralCode: string
  referralCount: number
  creditBalance: number
}

export default function Refer() {
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  useEffect(() => {
    loadReferralStats()
  }, [])

  async function loadReferralStats() {
    const code = await window.api.settings.get('referral_code') as string | null
    const count = parseInt(await window.api.settings.get('referral_count') as string || '0', 10)
    const balance = parseInt(await window.api.settings.get('referral_credit_balance') as string || '0', 10)

    if (!code) {
      // Generate a new referral code
      const newCode = 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase()
      await window.api.settings.set('referral_code', newCode)
      setStats({ referralCode: newCode, referralCount: count, creditBalance: balance })
    } else {
      setStats({ referralCode: code, referralCount: count, creditBalance: balance })
    }
  }

  function getReferralUrl() {
    return `https://nexuscrm.app/r/${stats?.referralCode || ''}`
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(getReferralUrl())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleShareX() {
    const text = encodeURIComponent("I've been using Nexus as my personal CRM and it's been a game-changer for managing relationships. Try it out:")
    const url = encodeURIComponent(getReferralUrl())
    window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank')
  }

  function handleShareLinkedIn() {
    const url = encodeURIComponent(getReferralUrl())
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank')
  }

  function handleShareEmail() {
    const subject = encodeURIComponent('Try Nexus - Personal CRM')
    const body = encodeURIComponent(`Hey!\n\nI've been using Nexus as my personal CRM to manage my network and relationships. It's been really helpful for keeping in touch with people.\n\nCheck it out: ${getReferralUrl()}\n\nWe both get $6 credit when you sign up!`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  function handleShareFacebook() {
    const url = encodeURIComponent(getReferralUrl())
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
  }

  function handleEmailInvite() {
    if (!inviteEmail.trim()) return
    const subject = encodeURIComponent('Try Nexus - Personal CRM')
    const body = encodeURIComponent(`Hey!\n\nI've been using Nexus as my personal CRM to manage my network and relationships. It's been really helpful for keeping in touch with people.\n\nCheck it out: ${getReferralUrl()}\n\nWe both get $6 credit when you sign up!`)
    window.open(`mailto:${inviteEmail}?subject=${subject}&body=${body}`)
    setInviteEmail('')
  }

  if (!stats) return null

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-2xl mb-4">
            {'\u{1F381}'}
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Refer a Friend</h1>
          <p className="text-sm text-zinc-500 mt-2 max-w-md mx-auto">
            Share Nexus with friends and colleagues. You both get <span className="font-semibold text-violet-600 dark:text-violet-400">$6 credit</span> (1 month of Pro) for each successful referral.
          </p>
        </div>

        {/* Referral Link */}
        <div className="glass p-6 mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Your Referral Link</h2>
          <div className="flex gap-2">
            <div className="flex-1 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700/50 rounded-lg px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 font-mono truncate">
              {getReferralUrl()}
            </div>
            <button
              onClick={handleCopy}
              className={`px-4 py-3 text-sm font-medium rounded-lg transition-colors flex-shrink-0 ${
                copied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-zinc-400 mt-2">Share this link. When someone signs up, you both get credit.</p>
        </div>

        {/* Share Buttons */}
        <div className="glass p-6 mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Share Via</h2>
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={handleShareX}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
            >
              <XIcon className="w-6 h-6 text-zinc-700 dark:text-zinc-300" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">X / Twitter</span>
            </button>
            <button
              onClick={handleShareLinkedIn}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
            >
              <LinkedInIcon className="w-6 h-6 text-[#0077B5]" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">LinkedIn</span>
            </button>
            <button
              onClick={handleShareFacebook}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
            >
              <FacebookIcon className="w-6 h-6 text-[#1877F2]" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Facebook</span>
            </button>
            <button
              onClick={handleShareEmail}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
            >
              <EmailIcon className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Email</span>
            </button>
          </div>
          {/* Direct email invite */}
          <div className="flex gap-2 mt-4">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="Enter friend's email..."
              className="flex-1 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700/50 rounded-lg px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50"
              onKeyDown={e => e.key === 'Enter' && handleEmailInvite()}
            />
            <button onClick={handleEmailInvite} disabled={!inviteEmail.trim()}
              className="px-4 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors flex-shrink-0">
              Send Invite
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="glass p-6 mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Your Referral Stats</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.referralCount}</p>
              <p className="text-xs text-zinc-500 mt-1">Referrals</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">${stats.creditBalance}</p>
              <p className="text-xs text-zinc-500 mt-1">Credit Balance</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">${stats.referralCount * 6}</p>
              <p className="text-xs text-zinc-500 mt-1">Total Earned</p>
            </div>
          </div>
          {stats.referralCount === 0 ? (
            <p className="text-xs text-zinc-400 mt-4 text-center">
              Share your referral link to track invites here.
            </p>
          ) : stats.creditBalance > 0 ? (
            <p className="text-xs text-zinc-400 mt-4 text-center">
              Credits are automatically applied to your next billing cycle.
            </p>
          ) : null}
        </div>

        {/* How It Works */}
        <div className="glass p-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">How It Works</h2>
          <div className="space-y-4">
            {[
              { step: '1', title: 'Share your link', desc: 'Send your unique referral link to friends and colleagues' },
              { step: '2', title: 'They sign up', desc: 'When someone creates a Nexus account using your link, they get $6 off' },
              { step: '3', title: 'You earn credit', desc: 'You receive $6 credit (1 month of Pro) applied to your account' }
            ].map(item => (
              <div key={item.step} className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-violet-600 dark:text-violet-400">{item.step}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{item.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="14" height="10" rx="2" />
      <path d="M1 5l7 4 7-4" />
    </svg>
  )
}
