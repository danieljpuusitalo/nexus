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
  created_at: string
  updated_at: string
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
  type: 'email' | 'call' | 'meeting' | 'note' | 'coffee' | 'event' | 'other'
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
