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
    getRecent: (limit: number) => ipcRenderer.invoke('db:contacts:getRecent', limit)
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

  // Data management
  data: {
    stats: () => ipcRenderer.invoke('db:stats'),
    exportCsv: () => ipcRenderer.invoke('db:export:csv'),
    exportFilteredCsv: (contactIds: number[]) => ipcRenderer.invoke('db:export:filteredCsv', contactIds),
    importSelectCsv: () => ipcRenderer.invoke('db:import:selectCsv'),
    importExecute: (rows: Record<string, string>[], mode: string) => ipcRenderer.invoke('db:import:execute', rows, mode),
    backup: () => ipcRenderer.invoke('db:backup'),
    resetDatabase: () => ipcRenderer.invoke('db:resetDatabase')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type NexusAPI = typeof api
