export interface Capability {
  icon: string;
  label: string;
}

export interface TimelineEntry {
  id: number;
  date: string;
  commitHash: string;
  title: string;
  description: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  capabilities: Capability[];
  significance: 'foundation' | 'major' | 'minor' | 'patch';
  narrative: string;
  isPR?: boolean;
  prNumber?: number;
  author?: string;
}

export interface ProjectStats {
  totalCommits: number;
  totalBranches: number;
  firstCommitDate: string;
  latestActivity: string;
  contributors: number;
}
