export interface Contact {
  id: number
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  job_title: string
  linkedin_url: string
  photo_url: string
  notes: string
  how_we_met: string
  birthday: string
  keep_in_touch_days: number
  location: string
  website: string
  twitter_url: string
  facebook_url: string
  instagram_url: string
  address: string
  education: string
  created_at: string
  updated_at: string
}

export interface ContactRelationship {
  id: number
  related_id: number
  relationship_type: string
  first_name: string
  last_name: string
  company: string
  photo_url: string
  created_at: string
}

export interface ContactWithTags extends Contact {
  tags: Tag[]
  groups: Group[]
}

export interface Tag {
  id: number
  name: string
  color: string
}

export interface TagWithCount extends Tag {
  contact_count: number
}

export interface Group {
  id: number
  name: string
  description: string
  color: string
}

export interface GroupWithCount extends Group {
  contact_count: number
}

export interface Interaction {
  id: number
  contact_id: number
  type: 'email' | 'call' | 'meeting' | 'note' | 'coffee' | 'event' | 'calendar' | 'job_change' | 'other'
  description: string
  date: string
  created_at: string
  // Joined fields
  first_name?: string
  last_name?: string
}

export interface Reminder {
  id: number
  contact_id: number
  message: string
  due_date: string
  completed: number
  repeat: 'none' | 'weekly' | 'monthly' | 'quarterly'
  created_at: string
  // Joined fields
  first_name?: string
  last_name?: string
}

export interface CustomField {
  id: number
  contact_id: number
  field_name: string
  field_value: string
}

export interface ImportantDate {
  id: number
  contact_id: number
  label: string
  date: string
}

export interface InteractionAttachment {
  id: number
  interaction_id: number
  file_name: string
  file_path: string
  file_type: string
  created_at: string
}

export interface SavedView {
  id: number
  name: string
  emoji: string
  filter_json: string
  sort_order: number
  created_at: string
}

export interface ViewFilter {
  search?: string
  groupId?: number
  tagIds?: number[]
  sortBy?: string
  location?: string
  company?: string
  hasFrequency?: boolean
}

export interface Favorite {
  id: number
  item_type: 'contact' | 'group' | 'view'
  item_id: number
  sort_order: number
  label: string
  emoji: string
}
