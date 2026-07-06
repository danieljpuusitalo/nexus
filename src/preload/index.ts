import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Contacts
  contacts: {
    getAll: () => ipcRenderer.invoke('db:contacts:getAll'),
    getAllWithTags: () => ipcRenderer.invoke('db:contacts:getAllWithTags'),
    getById: (id: number) => ipcRenderer.invoke('db:contacts:getById', id),
    create: (contact: Record<string, unknown>) => ipcRenderer.invoke('db:contacts:create', contact),
    update: (id: number, contact: Record<string, unknown>) => ipcRenderer.invoke('db:contacts:update', id, contact),
    delete: (id: number) => ipcRenderer.invoke('db:contacts:delete', id),
    count: () => ipcRenderer.invoke('db:contacts:count'),
    countThisMonth: () => ipcRenderer.invoke('db:contacts:countThisMonth'),
    getUpcomingBirthdays: (days: number) => ipcRenderer.invoke('db:contacts:getUpcomingBirthdays', days),
    getDueForContact: () => ipcRenderer.invoke('db:contacts:getDueForContact'),
    selectPhoto: () => ipcRenderer.invoke('db:contacts:selectPhoto'),
    savePhoto: (id: number, sourcePath: string) => ipcRenderer.invoke('db:contacts:savePhoto', id, sourcePath),
    getUncategorized: (limit: number) => ipcRenderer.invoke('db:contacts:getUncategorized', limit),
    countUncategorized: () => ipcRenderer.invoke('db:contacts:countUncategorized'),
    getLocationStats: () => ipcRenderer.invoke('db:contacts:getLocationStats'),
    getByLocation: (location: string) => ipcRenderer.invoke('db:contacts:getByLocation', location),
    getWithoutLocation: () => ipcRenderer.invoke('db:contacts:getWithoutLocation'),
    setLocation: (id: number, location: string) => ipcRenderer.invoke('db:contacts:setLocation', id, location),
    setKeepInTouch: (id: number, days: number) => ipcRenderer.invoke('db:contacts:setKeepInTouch', id, days),
    archive: (id: number) => ipcRenderer.invoke('db:contacts:archive', id),
    bulkSetFrequency: (ids: number[], days: number) => ipcRenderer.invoke('db:contacts:bulkSetFrequency', ids, days),
    bulkAddTag: (ids: number[], tagId: number) => ipcRenderer.invoke('db:contacts:bulkAddTag', ids, tagId),
    bulkAddGroup: (ids: number[], groupId: number) => ipcRenderer.invoke('db:contacts:bulkAddGroup', ids, groupId),
    bulkArchive: (ids: number[]) => ipcRenderer.invoke('db:contacts:bulkArchive', ids),
    bulkDelete: (ids: number[]) => ipcRenderer.invoke('db:contacts:bulkDelete', ids),
    findDuplicates: () => ipcRenderer.invoke('db:contacts:findDuplicates'),
    merge: (keepId: number, mergeId: number) => ipcRenderer.invoke('db:contacts:merge', keepId, mergeId),
    generateQR: (contact: { first_name: string; last_name: string; email?: string; phone?: string; company?: string; job_title?: string; website?: string; linkedin_url?: string }) => ipcRenderer.invoke('contact:generateQR', contact),
  },

  // Tags
  tags: {
    getAll: () => ipcRenderer.invoke('db:tags:getAll'),
    getAllWithCounts: () => ipcRenderer.invoke('db:tags:getAllWithCounts'),
    create: (tag: Record<string, unknown>) => ipcRenderer.invoke('db:tags:create', tag),
    update: (id: number, tag: Record<string, unknown>) => ipcRenderer.invoke('db:tags:update', id, tag),
    delete: (id: number) => ipcRenderer.invoke('db:tags:delete', id),
    getContacts: (tagId: number) => ipcRenderer.invoke('db:tags:getContacts', tagId)
  },

  // Contact Tags
  contactTags: {
    add: (contactId: number, tagId: number) => ipcRenderer.invoke('db:contactTags:add', contactId, tagId),
    remove: (contactId: number, tagId: number) => ipcRenderer.invoke('db:contactTags:remove', contactId, tagId),
    getForContact: (contactId: number) => ipcRenderer.invoke('db:contactTags:getForContact', contactId)
  },

  // Groups
  groups: {
    getAll: () => ipcRenderer.invoke('db:groups:getAll'),
    getAllWithCounts: () => ipcRenderer.invoke('db:groups:getAllWithCounts'),
    create: (group: Record<string, unknown>) => ipcRenderer.invoke('db:groups:create', group),
    update: (id: number, group: Record<string, unknown>) => ipcRenderer.invoke('db:groups:update', id, group),
    delete: (id: number) => ipcRenderer.invoke('db:groups:delete', id),
    getContacts: (groupId: number) => ipcRenderer.invoke('db:groups:getContacts', groupId)
  },

  // Contact Groups
  contactGroups: {
    add: (contactId: number, groupId: number) => ipcRenderer.invoke('db:contactGroups:add', contactId, groupId),
    remove: (contactId: number, groupId: number) => ipcRenderer.invoke('db:contactGroups:remove', contactId, groupId),
    getForContact: (contactId: number) => ipcRenderer.invoke('db:contactGroups:getForContact', contactId)
  },

  // Interactions
  interactions: {
    getAll: () => ipcRenderer.invoke('db:interactions:getAll'),
    getForContact: (contactId: number) => ipcRenderer.invoke('db:interactions:getForContact', contactId),
    getLastDates: () => ipcRenderer.invoke('db:interactions:getLastDates'),
    create: (interaction: Record<string, unknown>) => ipcRenderer.invoke('db:interactions:create', interaction),
    delete: (id: number) => ipcRenderer.invoke('db:interactions:delete', id),
    getLastForContacts: () => ipcRenderer.invoke('db:interactions:getLastForContacts'),
    countThisWeek: () => ipcRenderer.invoke('db:interactions:countThisWeek'),
    getRecentContacted: (limit: number) => ipcRenderer.invoke('db:interactions:getRecentContacted', limit)
  },

  // Reminders
  reminders: {
    getAll: () => ipcRenderer.invoke('db:reminders:getAll'),
    getForContact: (contactId: number) => ipcRenderer.invoke('db:reminders:getForContact', contactId),
    create: (reminder: Record<string, unknown>) => ipcRenderer.invoke('db:reminders:create', reminder),
    toggleComplete: (id: number) => ipcRenderer.invoke('db:reminders:toggleComplete', id),
    delete: (id: number) => ipcRenderer.invoke('db:reminders:delete', id),
    countPending: () => ipcRenderer.invoke('db:reminders:countPending'),
    getOverdueCount: () => ipcRenderer.invoke('db:reminders:getOverdueCount'),
    getDueToday: () => ipcRenderer.invoke('db:reminders:getDueToday')
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('db:settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('db:settings:set', key, value),
    getAll: () => ipcRenderer.invoke('db:settings:getAll')
  },

  // Custom Fields
  customFields: {
    getForContact: (contactId: number) => ipcRenderer.invoke('db:customFields:getForContact', contactId),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('db:customFields:create', data),
    update: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('db:customFields:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('db:customFields:delete', id)
  },

  // Important Dates
  importantDates: {
    getForContact: (contactId: number) => ipcRenderer.invoke('db:importantDates:getForContact', contactId),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('db:importantDates:create', data),
    update: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('db:importantDates:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('db:importantDates:delete', id)
  },

  // Related Contacts
  relationships: {
    getForContact: (contactId: number) => ipcRenderer.invoke('db:relationships:getForContact', contactId),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('db:relationships:create', data),
    delete: (id: number) => ipcRenderer.invoke('db:relationships:delete', id)
  },

  // Attachments
  attachments: {
    getForInteraction: (interactionId: number) => ipcRenderer.invoke('db:attachments:getForInteraction', interactionId),
    add: (interactionId: number, filePath: string) => ipcRenderer.invoke('db:attachments:add', interactionId, filePath),
    delete: (id: number) => ipcRenderer.invoke('db:attachments:delete', id),
    selectFile: () => ipcRenderer.invoke('db:attachments:selectFile'),
    openFile: (filePath: string) => ipcRenderer.invoke('db:attachments:openFile', filePath)
  },

  // Pipeline
  pipeline: {
    getData: () => ipcRenderer.invoke('db:pipeline:getData')
  },

  // Visualizations
  viz: {
    groupsTree: () => ipcRenderer.invoke('db:viz:groupsTree'),
    relatedWeb: () => ipcRenderer.invoke('db:viz:relatedWeb')
  },

  // Dashboard
  dashboard: {
    getActivityFeed: (limit: number) => ipcRenderer.invoke('db:dashboard:getActivityFeed', limit),
    getKeepInTouchDue: () => ipcRenderer.invoke('db:dashboard:getKeepInTouchDue'),
    getUpcomingBirthdays: (days: number) => ipcRenderer.invoke('db:dashboard:getUpcomingBirthdays', days),
    getRelationshipHealth: () => ipcRenderer.invoke('db:dashboard:getRelationshipHealth'),
    getNetworkUpdates: (limit: number) => ipcRenderer.invoke('db:dashboard:getNetworkUpdates', limit)
  },

  // Sync operations
  sync: {
    getPendingChanges: (table: string) => ipcRenderer.invoke('db:sync:getPendingChanges', table),
    getPendingJunctionChanges: (table: string) => ipcRenderer.invoke('db:sync:getPendingJunctionChanges', table),
    getDeletedRows: (table: string) => ipcRenderer.invoke('db:sync:getDeletedRows', table),
    markSynced: (table: string, localId: number, cloudId: string) => ipcRenderer.invoke('db:sync:markSynced', table, localId, cloudId),
    markJunctionSynced: (table: string, col1: string, val1: number, col2: string, val2: number, cloudId: string) => ipcRenderer.invoke('db:sync:markJunctionSynced', table, col1, val1, col2, val2, cloudId),
    purgeDeleted: (table: string, localId: number) => ipcRenderer.invoke('db:sync:purgeDeleted', table, localId),
    upsertFromCloud: (table: string, cloudId: string, data: Record<string, unknown>) => ipcRenderer.invoke('db:sync:upsertFromCloud', table, cloudId, data),
    getLog: () => ipcRenderer.invoke('db:sync:getLog'),
    updateLog: (table: string, field: string, timestamp: string) => ipcRenderer.invoke('db:sync:updateLog', table, field, timestamp),
    getIdMap: (table: string) => ipcRenderer.invoke('db:sync:getIdMap', table)
  },

  // Copilot Conversations
  copilot: {
    getAll: () => ipcRenderer.invoke('db:copilot:getAll'),
    save: (id: number | null, title: string, messagesJson: string) => ipcRenderer.invoke('db:copilot:save', id, title, messagesJson),
    delete: (id: number) => ipcRenderer.invoke('db:copilot:delete', id)
  },

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    showLogsFolder: () => ipcRenderer.invoke('app:showLogsFolder')
  },

  // Google Integration
  google: {
    getStatus: () => ipcRenderer.invoke('google:getStatus'),
    connect: () => ipcRenderer.invoke('google:connect'),
    disconnect: () => ipcRenderer.invoke('google:disconnect'),
    getAccessToken: () => ipcRenderer.invoke('google:getAccessToken'),
    getAutoSyncStatus: () => ipcRenderer.invoke('google:getAutoSyncStatus'),
    enableAutoSync: (frequency: string) => ipcRenderer.invoke('google:enableAutoSync', frequency),
    disableAutoSync: () => ipcRenderer.invoke('google:disableAutoSync'),
    runSync: () => ipcRenderer.invoke('google:runSync'),
    runSignatureEnrichment: () => ipcRenderer.invoke('google:runSignatureEnrichment'),
  },

  // Microsoft Integration
  microsoft: {
    setCredentials: (clientId: string) =>
      ipcRenderer.invoke('microsoft:setCredentials', clientId),
    getStatus: () => ipcRenderer.invoke('microsoft:getStatus'),
    connect: () => ipcRenderer.invoke('microsoft:connect'),
    disconnect: () => ipcRenderer.invoke('microsoft:disconnect'),
    getAccessToken: () => ipcRenderer.invoke('microsoft:getAccessToken'),
    syncCalendar: () => ipcRenderer.invoke('microsoft:syncCalendar'),
    syncEmail: () => ipcRenderer.invoke('microsoft:syncEmail'),
    importContacts: () => ipcRenderer.invoke('microsoft:importContacts'),
    getContactsAutoSyncStatus: () => ipcRenderer.invoke('microsoft:getContactsAutoSyncStatus'),
    enableContactsAutoSync: (frequency: string) => ipcRenderer.invoke('microsoft:enableContactsAutoSync', frequency),
    disableContactsAutoSync: () => ipcRenderer.invoke('microsoft:disableContactsAutoSync'),
  },

  // AI
  ai: {
    getStatus: () => ipcRenderer.invoke('ai:getStatus'),
    setApiKey: (key: string) => ipcRenderer.invoke('ai:setApiKey', key),
    removeApiKey: () => ipcRenderer.invoke('ai:removeApiKey'),
    chat: (messages: { role: string; content: string }[], systemPrompt: string) =>
      ipcRenderer.invoke('ai:chat', messages, systemPrompt),
    networkQuery: (question: string, history: { role: string; content: string }[]) =>
      ipcRenderer.invoke('ai:networkQuery', question, history),
    reconnectionMessages: (contactId: number) => ipcRenderer.invoke('ai:reconnectionMessages', contactId),
    meetingBriefing: (contactId: number, topic?: string) => ipcRenderer.invoke('ai:meetingBriefing', contactId, topic),
    summarizeNotes: (text: string) => ipcRenderer.invoke('ai:summarizeNotes', text),
    suggestTags: (contactId: number) => ipcRenderer.invoke('ai:suggestTags', contactId),
    weeklyDigest: () => ipcRenderer.invoke('ai:weeklyDigest')
  },

  // Plan / Subscription
  plan: {
    getStatus: () => ipcRenderer.invoke('db:plan:getStatus'),
    startTrial: () => ipcRenderer.invoke('db:plan:startTrial'),
    setPlan: (planType: string) => ipcRenderer.invoke('db:plan:setPlan', planType),
    trackAiAction: () => ipcRenderer.invoke('db:plan:trackAiAction')
  },

  // Stripe / Billing
  stripe: {
    createCheckout: (plan: string, billing: string) => ipcRenderer.invoke('stripe:createCheckout', plan, billing),
    checkSubscription: () => ipcRenderer.invoke('stripe:checkSubscription'),
    openPortal: () => ipcRenderer.invoke('stripe:openPortal')
  },

  // Onboarding
  onboarding: {
    getProgress: () => ipcRenderer.invoke('db:onboarding:getProgress'),
    completeStep: (stepId: string) => ipcRenderer.invoke('db:onboarding:completeStep', stepId),
    resetProgress: () => ipcRenderer.invoke('db:onboarding:resetProgress'),
    checkStatus: () => ipcRenderer.invoke('db:onboarding:checkStatus')
  },

  // Saved Views
  views: {
    getAll: () => ipcRenderer.invoke('db:views:getAll'),
    create: (view: { name: string; emoji: string; filter_json: string }) => ipcRenderer.invoke('db:views:create', view),
    update: (id: number, view: Record<string, unknown>) => ipcRenderer.invoke('db:views:update', id, view),
    delete: (id: number) => ipcRenderer.invoke('db:views:delete', id)
  },

  // Favorites
  favorites: {
    getAll: () => ipcRenderer.invoke('db:favorites:getAll'),
    add: (itemType: string, itemId: number) => ipcRenderer.invoke('db:favorites:add', itemType, itemId),
    remove: (itemType: string, itemId: number) => ipcRenderer.invoke('db:favorites:remove', itemType, itemId),
    isFavorite: (itemType: string, itemId: number) => ipcRenderer.invoke('db:favorites:isFavorite', itemType, itemId)
  },

  // Data management
  data: {
    stats: () => ipcRenderer.invoke('db:stats'),
    exportCsv: () => ipcRenderer.invoke('db:export:csv'),
    exportFullCsv: () => ipcRenderer.invoke('db:export:fullCsv'),
    exportJson: () => ipcRenderer.invoke('db:export:json'),
    exportFilteredCsv: (contactIds: number[]) => ipcRenderer.invoke('db:export:filteredCsv', contactIds),
    exportVcard: () => ipcRenderer.invoke('db:export:vcard'),
    exportFull: () => ipcRenderer.invoke('db:export:full'),
    importSelectCsv: () => ipcRenderer.invoke('db:import:selectCsv'),
    importReadFile: (filePath: string) => ipcRenderer.invoke('db:import:readFile', filePath),
    importExecute: (rows: Record<string, string>[], mode: string) => ipcRenderer.invoke('db:import:execute', rows, mode),
    importInteractions: (rows: Record<string, string>[]) => ipcRenderer.invoke('db:import:executeInteractions', rows),
    importInstagramZip: (filePath: string) => ipcRenderer.invoke('db:import:instagramZip', filePath),
    importWhatsAppFile: (filePath: string) => ipcRenderer.invoke('db:import:whatsappFile', filePath),
    importTelegramFile: (filePath: string) => ipcRenderer.invoke('db:import:telegramFile', filePath),
    importBusinessCardText: (text: string) => ipcRenderer.invoke('db:import:businessCardText', text),
    selectPlatformFile: (platform: string) => ipcRenderer.invoke('db:import:selectPlatformFile', platform),
    backup: () => ipcRenderer.invoke('db:backup'),
    backupList: () => ipcRenderer.invoke('db:backup:list'),
    backupRestore: (backupPath: string) => ipcRenderer.invoke('db:backup:restore', backupPath),
    resetDatabase: () => ipcRenderer.invoke('db:resetDatabase')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type NexusAPI = typeof api
