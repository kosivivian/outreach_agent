'use client'
import { create } from 'zustand'

export type LeadTab = 'selected' | 'needs_review' | 'not_qualified' | 'all' | 'screened_out'
export type ActivityTab = 'errors' | 'tools' | 'phases'

interface RunViewState {
  tab: LeadTab
  openLeadId: string | null
  activity: ActivityTab | null
  setTab: (tab: LeadTab) => void
  openLead: (id: string | null) => void
  focusLead: (id: string, tab?: LeadTab) => void
  openActivity: (tab: ActivityTab | null) => void
}

export const useRunView = create<RunViewState>((set) => ({
  tab: 'selected',
  openLeadId: null,
  activity: null,
  setTab: (tab) => set({ tab }),
  openLead: (id) => set({ openLeadId: id }),
  focusLead: (id, tab) => set((s) => ({ openLeadId: id, tab: tab ?? s.tab })),
  openActivity: (activity) => set({ activity }),
}))
