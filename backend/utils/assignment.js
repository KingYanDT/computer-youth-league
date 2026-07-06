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

/**
 * 把任务的 assigned_to 解析后同步到 task_assignees 中间表。
 * 必须在事务中调用，使用传入的 conn。
 * 采用 "DELETE + INSERT" 策略保证幂等。
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} taskId
 * @param {string} assignmentValue serializeAssignment 的输出
 * @param {Array<{id:string,name:string,role:string,department_id:string|null}>} [allUsers]
 *        可选预加载的用户列表，避免重复查库；未提供时会自行查询
 */
async function syncTaskAssignees(conn, taskId, assignmentValue, allUsers) {
  let users = allUsers;
  if (!users) {
    const [rows] = await conn.query('SELECT id, name, role, department_id FROM users');
    users = rows;
  }
  const userIds = resolveAssignmentUsers(assignmentValue, users);

  await conn.query('DELETE FROM task_assignees WHERE task_id = ?', [taskId]);
  if (userIds.length === 0) return;

  // 批量插入
  const values = userIds.map(uid => [taskId, uid]);
  await conn.query('INSERT INTO task_assignees (task_id, user_id) VALUES ?', [values]);
}

/**
 * 获取被指派到某任务的用户列表。
 * 优先从 task_assignees 中间表查询（带索引）；
 * 若中间表无记录（老数据未迁移），则回退到解析 assigned_to TEXT。
 */
async function getAssignedUsers(poolOrConn, assignmentValue, taskId) {
  // 优先走中间表
  if (taskId) {
    const [rows] = await poolOrConn.query(
      `SELECT u.id, u.name, u.role, u.department_id
       FROM task_assignees ta
       JOIN users u ON ta.user_id = u.id
       WHERE ta.task_id = ?`,
      [taskId]
    );
    if (rows.length > 0) return rows;
  }
  // 回退到 TEXT 解析（兼容未迁移的老任务）
  const [users] = await poolOrConn.query('SELECT id, name, role, department_id FROM users');
  const ids = new Set(resolveAssignmentUsers(assignmentValue, users));
  return users.filter(user => ids.has(user.id));
}

module.exports = {
  COMMITTEE_ROLES,
  parseAssignment,
  serializeAssignment,
  resolveAssignmentUsers,
  syncTaskAssignees,
  getAssignedUsers
};
