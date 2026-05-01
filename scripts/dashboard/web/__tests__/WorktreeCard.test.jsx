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

  it('path — 마지막 segment만 표시', () => {
    render(<WorktreeCard worktree={fullWorktree} />);
    expect(screen.getByText('project')).toBeInTheDocument();
  });

  it('path — full path가 title 속성에 있음', () => {
    render(<WorktreeCard worktree={fullWorktree} />);
    const dd = screen.getByTitle('/workspace/project');
    expect(dd).toBeInTheDocument();
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

// U20, U21
describe('WorktreeCard — stepper 통합', () => {
  it('U20 — completedSteps 있을 때 stepper 렌더 + design이 active (init은 시각화에서 제외)', () => {
    const worktree = {
      ...fullWorktree,
      completedSteps: ['init', 'start', 'plan'],
    };
    render(<WorktreeCard worktree={worktree} />);
    const stepper = document.querySelector('.wt-stepper');
    expect(stepper).not.toBeNull();
    const designStep = document.querySelector('[aria-label="design: active"]');
    expect(designStep?.className).toContain('wt-stepper__step--active');
  });

  it('U21 — completedSteps 누락 worktree → stepper 정상 렌더, start가 active', () => {
    const worktree = { ...fullWorktree, completedSteps: undefined };
    render(<WorktreeCard worktree={worktree} />);
    const startStep = document.querySelector('[aria-label="start: active"]');
    expect(startStep?.className).toContain('wt-stepper__step--active');
  });
});

// U14
describe('WorktreeCard — path last-segment', () => {
  it('trailing slash path에서 마지막 segment 반환', () => {
    const worktree = { ...fullWorktree, path: '/foo/bar/' };
    render(<WorktreeCard worktree={worktree} />);
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  it('긴 절대경로에서 TASK-ID segment 반환', () => {
    const worktree = {
      ...fullWorktree,
      path: '/Users/foo/WORK/workspace/jira-claude-code-integration_worktree/MAE-238',
    };
    render(<WorktreeCard worktree={worktree} />);
    expect(screen.getByText('MAE-238')).toBeInTheDocument();
  });

  it('긴 절대경로에서 title이 full path', () => {
    const fullPath = '/Users/foo/WORK/workspace/jira-claude-code-integration_worktree/MAE-238';
    const worktree = { ...fullWorktree, path: fullPath };
    render(<WorktreeCard worktree={worktree} />);
    expect(screen.getByTitle(fullPath)).toBeInTheDocument();
  });
});

// U15
describe('WorktreeCard — summary null placeholder', () => {
  const noSummaryWorktree = {
    path: '/workspace/project',
    branch: 'feature/MAE-238',
    taskId: 'MAE-238',
    noContext: false,
    cachedIssue: null,
    summary: null,
    activity: [],
  };

  it('(no summary) 텍스트 표시', () => {
    render(<WorktreeCard worktree={noSummaryWorktree} />);
    expect(screen.getByText('(no summary)')).toBeInTheDocument();
  });

  it('(no summary) 요소에 wt-card__summary--empty 클래스', () => {
    render(<WorktreeCard worktree={noSummaryWorktree} />);
    const el = screen.getByText('(no summary)');
    expect(el).toHaveClass('wt-card__summary--empty');
  });

  it('(no summary) 요소의 title이 "no Jira summary cached"', () => {
    render(<WorktreeCard worktree={noSummaryWorktree} />);
    const el = screen.getByText('(no summary)');
    expect(el).toHaveAttribute('title', 'no Jira summary cached');
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
