import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorkspaceGroup from '../src/components/WorkspaceGroup.jsx';

// MAE-280: WorkspaceGroup 컴포넌트 단위 테스트 (U5-U8)

const baseWs = {
  path: '/ws/my-project',
  registeredAt: '2026-01-01T00:00:00Z',
  lastSeenAt: null,
  status: 'active',
  health: 'healthy',
  worktreeCount: 2,
};

describe('WorkspaceGroup — U5: health=healthy', () => {
  it('.health-badge--healthy 클래스 존재', () => {
    render(<WorkspaceGroup workspace={baseWs} label="my-project" count={2}><span /></WorkspaceGroup>);
    expect(document.querySelector('.health-badge--healthy')).not.toBeNull();
  });
});

describe('WorkspaceGroup — U6: health=creds-missing', () => {
  it('.health-badge--creds-missing 클래스 존재', () => {
    const ws = { ...baseWs, health: 'creds-missing' };
    render(<WorkspaceGroup workspace={ws} label="my-project" count={1}><span /></WorkspaceGroup>);
    expect(document.querySelector('.health-badge--creds-missing')).not.toBeNull();
  });
});

describe('WorkspaceGroup — U7: 알 수 없는 health 값 fallback', () => {
  it('weird-value → .health-badge--unknown', () => {
    const ws = { ...baseWs, health: 'weird-value' };
    render(<WorkspaceGroup workspace={ws} label="my-project" count={1}><span /></WorkspaceGroup>);
    expect(document.querySelector('.health-badge--unknown')).not.toBeNull();
    expect(document.querySelector('.health-badge--weird-value')).toBeNull();
  });

  it('no-worktrees → .health-badge--no-worktrees', () => {
    const ws = { ...baseWs, health: 'no-worktrees' };
    render(<WorkspaceGroup workspace={ws} label="my-project" count={0}><span /></WorkspaceGroup>);
    expect(document.querySelector('.health-badge--no-worktrees')).not.toBeNull();
  });

  it('undefined health → .health-badge--unknown', () => {
    const ws = { ...baseWs, health: undefined };
    render(<WorkspaceGroup workspace={ws} label="my-project" count={1}><span /></WorkspaceGroup>);
    expect(document.querySelector('.health-badge--unknown')).not.toBeNull();
  });
});

describe('WorkspaceGroup — U8: count/lastSeenAt 렌더', () => {
  it('count=3 → 헤더에 "3개" 텍스트 포함', () => {
    render(<WorkspaceGroup workspace={baseWs} label="my-project" count={3}><span /></WorkspaceGroup>);
    expect(screen.getByText('3개')).toBeInTheDocument();
  });

  it('lastSeenAt=5분 전 → 상대시각 텍스트 표시', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const ws = { ...baseWs, lastSeenAt: fiveMinAgo };
    render(<WorkspaceGroup workspace={ws} label="my-project" count={2}><span /></WorkspaceGroup>);
    // "5분 전" 또는 유사한 분 단위 텍스트 확인
    const timeEl = document.querySelector('.workspace-group__time');
    expect(timeEl?.textContent).toMatch(/분 전/);
  });

  it('lastSeenAt=null → "—" 표시', () => {
    render(<WorkspaceGroup workspace={baseWs} label="my-project" count={1}><span /></WorkspaceGroup>);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('label 텍스트 렌더', () => {
    render(<WorkspaceGroup workspace={baseWs} label="my-project" count={1}><span /></WorkspaceGroup>);
    expect(screen.getByText('my-project')).toBeInTheDocument();
  });

  it('children slot 렌더', () => {
    render(
      <WorkspaceGroup workspace={baseWs} label="x" count={1}>
        <span data-testid="child-node">child</span>
      </WorkspaceGroup>
    );
    expect(screen.getByTestId('child-node')).toBeInTheDocument();
  });
});

describe('WorkspaceGroup — fallback(no workspace) 그룹', () => {
  it('workspace=null → health-badge--unknown, title 빈 문자열', () => {
    render(<WorkspaceGroup workspace={null} label="(no workspace)" count={1}><span /></WorkspaceGroup>);
    expect(document.querySelector('.health-badge--unknown')).not.toBeNull();
    expect(screen.getByText('(no workspace)')).toBeInTheDocument();
  });
});
