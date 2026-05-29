// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { SessionInfo, SessionGroup } from '../../../src/shared/types';
import {
  daemonIdOf,
  hostGroupKey,
  computeGroups,
  moveToGroup,
  toggleCollapse,
} from '../../../src/renderer/components/Sidebar';

function s(id: string, status: SessionInfo['status'] = 'idle'): SessionInfo {
  return { id, name: id, cwd: '/', command: '', pid: 1, status };
}

describe('daemonIdOf / hostGroupKey', () => {
  it('extracts the daemon id from a composite session id', () => {
    expect(daemonIdOf('localhost:abc')).toBe('localhost');
    expect(daemonIdOf('vm-a:xyz')).toBe('vm-a');
    expect(daemonIdOf('noColon')).toBe('');
  });
  it('builds host group keys', () => {
    expect(hostGroupKey('localhost')).toBe('daemon-localhost');
  });
});

describe('computeGroups', () => {
  const names = { localhost: 'Localhost', 'vm-a': 'VM A' };

  it('groups by host when there are no custom groups', () => {
    const groups = computeGroups([s('localhost:s1'), s('localhost:s2'), s('vm-a:s3')], {}, names);
    expect(groups.map((g) => g.key)).toEqual(['daemon-localhost', 'daemon-vm-a']);
    expect(groups[0].name).toBe('Localhost');
    expect(groups[0].sessions.map((x) => x.id)).toEqual(['localhost:s1', 'localhost:s2']);
    expect(groups[1].name).toBe('VM A');
  });

  it('honors explicit custom-group membership', () => {
    const custom: Record<string, SessionGroup> = {
      'group-1': { name: 'Work', collapsed: false, sessionIds: ['localhost:s2'] },
    };
    const groups = computeGroups([s('localhost:s1'), s('localhost:s2')], custom, names);
    const work = groups.find((g) => g.key === 'group-1')!;
    expect(work.name).toBe('Work');
    expect(work.sessions.map((x) => x.id)).toEqual(['localhost:s2']);
    const host = groups.find((g) => g.key === 'daemon-localhost')!;
    expect(host.sessions.map((x) => x.id)).toEqual(['localhost:s1']);
  });

  it('reflects collapsed state and falls back for stale group refs', () => {
    const custom: Record<string, SessionGroup> = {
      'daemon-localhost': { name: 'Localhost', collapsed: true, sessionIds: ['localhost:gone', 'localhost:s1'] },
    };
    const groups = computeGroups([s('localhost:s1')], custom, names);
    expect(groups[0].collapsed).toBe(true);
    // stale id 'localhost:gone' is filtered; existing one ordered first
    expect(groups[0].sessions.map((x) => x.id)).toEqual(['localhost:s1']);
  });
});

describe('moveToGroup', () => {
  it('removes the session from other groups and adds it to the target', () => {
    const groups: Record<string, SessionGroup> = {
      'group-1': { name: 'Work', collapsed: false, sessionIds: ['localhost:s1'] },
    };
    const next = moveToGroup(groups, 'localhost:s1', 'group-2', 'Play');
    expect(next['group-1'].sessionIds).toEqual([]);
    expect(next['group-2'].sessionIds).toEqual(['localhost:s1']);
    expect(next['group-2'].name).toBe('Play');
  });

  it('preserves an existing target group name', () => {
    const groups: Record<string, SessionGroup> = {
      'group-2': { name: 'Existing', collapsed: false, sessionIds: [] },
    };
    const next = moveToGroup(groups, 'localhost:s1', 'group-2', 'Ignored');
    expect(next['group-2'].name).toBe('Existing');
    expect(next['group-2'].sessionIds).toEqual(['localhost:s1']);
  });
});

describe('toggleCollapse', () => {
  it('flips collapsed and materializes a missing group', () => {
    const next = toggleCollapse({}, 'daemon-localhost', 'Localhost');
    expect(next['daemon-localhost'].collapsed).toBe(true);
    const back = toggleCollapse(next, 'daemon-localhost', 'Localhost');
    expect(back['daemon-localhost'].collapsed).toBe(false);
  });
});
