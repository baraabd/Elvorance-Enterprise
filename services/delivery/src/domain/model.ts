import type { ContractSnapshot, Entity } from '@atlas/contracts';
export interface Milestone {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
  dueOn: string | null;
  completedAt: string | null;
}
export interface Deliverable {
  id: string;
  title: string;
  content: string;
  url: string | null;
  milestoneId: string;
  status: 'pending' | 'approved' | 'changes_requested';
  revision: number;
  submittedAt: string;
  reviewedAt: string | null;
  feedback: string;
  history: { content: string; url: string | null; revision: number; feedback: string }[];
}
export interface Project extends Entity {
  contractId: string;
  clientId: string;
  repId: string;
  title: string;
  status: 'planning' | 'active' | 'completed';
  progress: number;
  contractSnapshot: ContractSnapshot;
  milestones: Milestone[];
  deliverables: Deliverable[];
  startedAt: string | null;
  completedAt: string | null;
}
