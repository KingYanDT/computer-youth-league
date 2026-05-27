const COMMITTEE_ROLES = ['secretary', 'viceSecretary', 'minister', 'viceMinister', 'member'];

function parseAssignment(value) {
  if (!value) return { mode: 'all', tags: ['all'], users: [] };
  if (value === 'all') return { mode: 'all', tags: ['all'], users: [] };
  if (value === 'branchSecretaries') return { mode: 'partial', tags: ['branch:all'], users: [] };

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return {
      mode: parsed.mode === 'partial' ? 'partial' : 'all',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      users: Array.isArray(parsed.users) ? parsed.users : []
    };
  } catch (err) {
    return { mode: 'partial', tags: [], users: [value] };
  }
}

function serializeAssignment(value) {
  const parsed = parseAssignment(value);
  if (parsed.mode === 'all') return 'all';
  if (parsed.tags.includes('all')) return 'all';
  return JSON.stringify(parsed);
}

function roleMatchesTag(user, tag) {
  if (tag === 'all') return true;
  if (tag === 'committee:all') return COMMITTEE_ROLES.includes(user.role);
  if (tag === 'committee:secretariat') return user.role === 'secretary' || user.role === 'viceSecretary';
  if (tag === 'committee:leaders:all') return user.role === 'minister' || user.role === 'viceMinister';
  if (tag.startsWith('committee:leaders:dept:')) {
    return (user.role === 'minister' || user.role === 'viceMinister') && user.department_id === tag.slice('committee:leaders:dept:'.length);
  }
  if (tag === 'committee:dept:all') return COMMITTEE_ROLES.includes(user.role) && !!user.department_id;
  if (tag === 'branch:all') return user.role === 'branchSecretary';
  if (tag.startsWith('committee:role:')) return user.role === tag.slice('committee:role:'.length);
  if (tag.startsWith('committee:dept:')) {
    return COMMITTEE_ROLES.includes(user.role) && user.department_id === tag.slice('committee:dept:'.length);
  }
  if (tag.startsWith('branch:dept:')) {
    return user.role === 'branchSecretary' && user.department_id === tag.slice('branch:dept:'.length);
  }
  return false;
}

function resolveAssignmentUsers(assignmentValue, users) {
  const assignment = parseAssignment(assignmentValue);
  if (assignment.mode === 'all') return users.map(user => user.id);

  const ids = new Set(assignment.users);
  for (const user of users) {
    if (assignment.tags.some(tag => roleMatchesTag(user, tag))) {
      ids.add(user.id);
    }
  }
  return [...ids];
}

async function getAssignedUsers(pool, assignmentValue) {
  const [users] = await pool.query('SELECT id, name, role, department_id FROM users');
  const ids = new Set(resolveAssignmentUsers(assignmentValue, users));
  return users.filter(user => ids.has(user.id));
}

module.exports = {
  COMMITTEE_ROLES,
  parseAssignment,
  serializeAssignment,
  resolveAssignmentUsers,
  getAssignedUsers
};
