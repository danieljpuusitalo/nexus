# Nexus CRM — Chrome Web Store Listing

## Extension Name
Nexus CRM — LinkedIn Capture

## Version
1.1.0

## Summary (132 char max)
Save LinkedIn profiles to your personal CRM with one click. Track contacts, notes, and reminders — all from LinkedIn.

## Description
Nexus CRM is a free, local-first personal CRM. This extension lets you save LinkedIn profiles to your Nexus account with one click.

**What it does:**
- One-click save: visit any LinkedIn profile and click "Save to Nexus"
- Captures name, title, company, location, and profile photo
- Detects job changes for contacts you've already saved
- Shows which profiles are already in your CRM

**What it does NOT do:**
- No bulk scraping or crawling
- No background data collection
- No data sold or shared with third parties

**Privacy:**
- Data is captured only when YOU click the save button
- Captured data goes to your own Nexus account (self-hosted Supabase)
- No analytics, no tracking, no telemetry

## Category
Productivity

## Privacy Disclosure

### Single Purpose
Save LinkedIn profile data to the user's personal CRM when the user clicks the save button.

### Permissions Justification
- `storage`: Store user's Supabase connection settings locally
- `activeTab`: Read the current LinkedIn profile page when user clicks save
- `host_permissions (linkedin.com)`: Content script injects the "Save to Nexus" button on LinkedIn profile pages

### Data Usage
- **What is read:** The LinkedIn profile page the user is currently viewing (name, title, company, location, photo URL)
- **When:** Only when the user clicks the "Save to Nexus" button
- **Where it goes:** The user's own Nexus CRM account (self-hosted Supabase instance)
- **What is stored locally:** Supabase URL and anon key (in chrome.storage.local)
- **No data is:** sold, shared with third parties, used for advertising, or transferred for purposes unrelated to the extension's single purpose

## Assets Checklist
- [ ] 128px icon (extension/icons/icon-128.png)
- [ ] At least one 1280x800 screenshot
- [ ] 440x280 small promotional tile
- [ ] Privacy policy URL (link to nexus landing/privacy.html)

## Chrome Web Store Developer Account
- $5 one-time registration fee required
- Submit at: https://chrome.google.com/webstore/devconsole
