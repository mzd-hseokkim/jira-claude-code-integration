import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorktreeCard from '../src/components/WorktreeCard.jsx';

const fullWorktree = {
  path: '/workspace/project',
  branch: 'feature/MAE-211',
  taskId: 'MAE-211',
  noContext: false,
  cachedIssue: {
    key: 'MAE-211',
    summary: 'React UI dashboard',
    status: '진행 중',
    priority: '주요',
    assignee: 'Test User',
    issuetype: '작업',
  },
  activity: [],
};

// U12
describe('WorktreeCard — 풀 데이터', () => {
  it('taskId 표시', () => {
    render(<WorktreeCard worktree={fullWorktree} />);
    expect(screen.getByText('MAE-211')).toBeInTheDocument();
  });

  it('branch 표시', () => {
    render(<WorktreeCard worktree={fullWorktree} />);
    expect(screen.getByText('feature/MAE-211')).toBeInTheDocument();
  });

  it('path 표시', () => {
    render(<WorktreeCard worktree={fullWorktree} />);
    expect(screen.getByText('/workspace/project')).toBeInTheDocument();
  });

  it('summary 표시', () => {
    render(<WorktreeCard worktree={fullWorktree} />);
    expect(screen.getByText('React UI dashboard')).toBeInTheDocument();
  });

  it('status 표시', () => {
    render(<WorktreeCard worktree={fullWorktree} />);
    expect(screen.getByText('진행 중')).toBeInTheDocument();
  });

  it('priority 표시', () => {
    render(<WorktreeCard worktree={fullWorktree} />);
    expect(screen.getByText('주요')).toBeInTheDocument();
  });

  it('assignee 표시', () => {
    render(<WorktreeCard worktree={fullWorktree} />);
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });
});

// U13
describe('WorktreeCard — noContext fallback', () => {
  const noCtxWorktree = {
    path: '/workspace/no-ctx',
    branch: null,
    taskId: null,
    noContext: true,
    cachedIssue: null,
    activity: [],
  };

  it('"no context" 배지 표시', () => {
    render(<WorktreeCard worktree={noCtxWorktree} />);
    expect(screen.getByText('no context')).toBeInTheDocument();
  });

  it('Jira 필드 자리에 "—" 표시', () => {
    render(<WorktreeCard worktree={noCtxWorktree} />);
    // status/priority/assignee 자리는 모두 "—"
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });
});
