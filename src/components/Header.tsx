import React from 'react';
import { Eye, GitPullRequest, FileText, Users, Calendar } from 'lucide-react';
import { ProjectStats } from '../types';

interface HeaderProps {
  stats: ProjectStats;
}

export const Header: React.FC<HeaderProps> = ({ stats }) => {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <Eye className="text-primary" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-base-content">
            StableWarden
          </h1>
          <p className="text-xs text-base-content/50 tracking-widest uppercase">
            The Record
          </p>
        </div>
      </div>

      <p className="text-base-content/60 text-sm mt-3 mb-6 max-w-xl">
        A transparent, human-verified chronicle of AI development. Every entry documented. Every capability tracked. Every breakthrough witnessed.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<FileText size={16} className="opacity-60" />} label="Documented" value={stats.totalEntries.toLocaleString()} />
        <StatCard icon={<GitPullRequest size={16} className="opacity-60" />} label="Pull Requests" value={stats.totalPRs.toLocaleString()} />
        <StatCard icon={<Calendar size={16} className="opacity-60" />} label="First Commit" value="Oct 29, 2025" />
        <StatCard icon={<Users size={16} className="opacity-60" />} label="Latest" value={stats.latestActivity} />
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value }) => (
  <div className="bg-base-200 rounded-lg p-3">
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <span className="text-xs text-base-content/50 uppercase tracking-wider">{label}</span>
    </div>
    <span className="text-lg font-bold text-base-content">{value}</span>
  </div>
);
