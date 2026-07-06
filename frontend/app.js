var API = {
  get: function(url) { return fetch(url, {credentials:'same-origin'}).then(function(r) { if(r.status===401) { state.currentUser=null; showLogin(); return Promise.reject({error:'未登录'}); } return r.json().then(function(d) { if(!r.ok) return Promise.reject(d); return d; }); }); },
  post: function(url, body) { return fetch(url, {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r) { if(r.status===401) { state.currentUser=null; showLogin(); return Promise.reject({error:'未登录'}); } return r.json().then(function(d) { if(!r.ok) return Promise.reject(d); return d; }); }); },
  put: function(url, body) { return fetch(url, {method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r) { if(r.status===401) { state.currentUser=null; showLogin(); return Promise.reject({error:'未登录'}); } return r.json().then(function(d) { if(!r.ok) return Promise.reject(d); return d; }); }); },
  del: function(url) { return fetch(url, {method:'DELETE',credentials:'same-origin'}).then(function(r) { if(r.status===401) { state.currentUser=null; showLogin(); return Promise.reject({error:'未登录'}); } return r.json().then(function(d) { if(!r.ok) return Promise.reject(d); return d; }); }); },
  upload: function(url, formData) { return fetch(url, {method:'POST',credentials:'same-origin',body:formData}).then(function(r) { if(r.status===401) { state.currentUser=null; showLogin(); return Promise.reject({error:'未登录'}); } return r.json().then(function(d) { if(!r.ok) return Promise.reject(d); return d; }); }); },
  uploadPut: function(url, formData) { return fetch(url, {method:'PUT',credentials:'same-origin',body:formData}).then(function(r) { if(r.status===401) { state.currentUser=null; showLogin(); return Promise.reject({error:'未登录'}); } return r.json().then(function(d) { if(!r.ok) return Promise.reject(d); return d; }); }); }
};

function mapTask(t) { return { id:t.id, title:t.title, description:t.description, category:t.category, year:t.year, month:t.month, day:t.day, frequency:t.frequency, timeSlot:t.time_slot, department:t.department_id, assignedTo:t.assigned_to, createdBy:t.created_by, isRegular:!!t.is_regular, status:t.status, createdAt:t.created_at }; }
function mapDept(d) { return { id:d.id, name:d.name, ministerId:d.minister_id, color:d.color }; }
function mapUser(u) { return { id:u.id, name:u.name, username:u.username, role:u.role, department:u.department_id, createdAt:u.created_at }; }
function mapFile(f) { return { id:f.id, taskId:f.task_id, fileName:f.file_name, fileSize:f.file_size, submittedBy:f.submitted_by, submittedByName:f.submitted_by_name, department:f.department_id, submittedAt:f.submitted_at, status:f.status, returnedBy:f.returned_by, returnedAt:f.returned_at, returnReason:f.return_reason }; }
function mapSummary(s) { return { id:s.id, taskId:s.task_id, fileName:s.file_name, fileSize:s.file_size, uploadedBy:s.uploaded_by, department:s.department_id, uploadedAt:s.uploaded_at }; }
function mapNotif(n) { return { id:n.id, type:n.type, title:n.title, message:n.message, targetUser:n.target_user, read:!!n.is_read, createdAt:n.created_at }; }

var ROLE_MAP = {
  secretary: '团委书记',
  viceSecretary: '团委副书记',
  minister: '部长',
  member: '部员',
  branchSecretary: '团支书'
};

var CATEGORIES = ['组织生活', '学习教育', '主题活动', '日常工作', '其他'];
var FREQUENCIES = ['每周', '每月', '每季度', '每学期', '每年', '不定期'];
var CAT_TAG_CLASS = {
  '组织生活': 'tag-org',
  '学习教育': 'tag-learn',
  '主题活动': 'tag-activity',
  '日常工作': 'tag-daily',
  '其他': 'tag-other'
};

var DEPT_COLORS = {
  dept1: '#722ed1',
  dept2: '#13c2c2',
  dept3: '#fa8c16',
  dept4: '#eb2f96'
};

var state = {
  currentUser: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  currentNav: 'tasks',
  fileFilter: 'all',
  searchQuery: '',
  data: null,
  pendingFiles: [],
  pendingSummaryFiles: [],
  resubmitFileId: null,
  deptDetailId: null,
  deptDetailTab: 'tasks',
  isPreviousYear: false
};

function loadData() {
  return Promise.all([
    API.get('/api/tasks?pageSize=200'),
    API.get('/api/departments'),
    API.get('/api/users?pageSize=200').catch(function() { return API.get('/api/users/assignees').catch(function() { return { users: [] }; }); }),
    API.get('/api/files?pageSize=200'),
    API.get('/api/summary?pageSize=200'),
    API.get('/api/notifications?pageSize=200')
  ]).then(function(results) {
    state.data = {
      tasks: ((results[0] && results[0].tasks) || []).map(mapTask),
      departments: ((results[1] && results[1].departments) || []).map(mapDept),
      users: ((results[2] && results[2].users) || []).map(mapUser),
      fileSubmissions: ((results[3] && results[3].files) || []).map(mapFile),
      summaryFiles: ((results[4] && results[4].summaries) || []).map(mapSummary),
      notifications: ((results[5] && results[5].notifications) || []).map(mapNotif)
    };
  }).catch(function(err) {
    console.error('加载数据失败:', err);
    if (!state.data) {
      state.data = {
        tasks: [],
        departments: [],
        users: [],
        fileSubmissions: [],
        summaryFiles: [],
        notifications: []
      };
    }
  });
}

function canPublishTask() {
  if (!state.currentUser) return false;
  var r = state.currentUser.role;
  return r === 'secretary' || r === 'viceSecretary' || r === 'minister';
}

function canDeleteTask() {
  if (!state.currentUser) return false;
  return state.currentUser.role === 'secretary' || state.currentUser.role === 'viceSecretary';
}

function canSubmitFile() {
  if (!state.currentUser) return false;
  return state.currentUser.role === 'branchSecretary';
}

function canCurrentUserSubmitTask(task) {
  if (!canSubmitFile()) return false;
  return getAssignedUsersForTask(task, false).some(function(user) { return user.id === state.currentUser.id; });
}

function canReturnFile() {
  if (!state.currentUser) return false;
  var r = state.currentUser.role;
  return r === 'secretary' || r === 'viceSecretary' || r === 'minister' || r === 'viceMinister';
}

function canUploadSummary() {
  if (!state.currentUser) return false;
  var r = state.currentUser.role;
  return r === 'secretary' || r === 'viceSecretary' || r === 'minister';
}

function canManageUsers() {
  if (!state.currentUser) return false;
  return state.currentUser.role === 'secretary';
}

function canViewAllDepts() {
  if (!state.currentUser) return false;
  return state.currentUser.role === 'secretary' || state.currentUser.role === 'viceSecretary';
}

function getUserDept() {
  if (!state.currentUser || !state.currentUser.department) return null;
  return state.data.departments.find(function(d) { return d.id === state.currentUser.department; });
}

function getDeptColor(deptId) {
  var dept = state.data.departments.find(function(d) { return d.id === deptId; });
  return dept ? (dept.color || '#999') : '#999';
}

function getDeptName(deptId) {
  var dept = state.data.departments.find(function(d) { return d.id === deptId; });
  return dept ? dept.name : '未知部门';
}

function canAccessDept(deptId) {
  if (!state.currentUser) return false;
  if (state.currentUser.role === 'secretary' || state.currentUser.role === 'viceSecretary') return true;
  return state.currentUser.department === deptId;
}

function canViewFileFromFileDept(fileDeptId) {
  if (!state.currentUser) return false;
  if (state.currentUser.role === 'secretary' || state.currentUser.role === 'viceSecretary') return true;
  if (state.currentUser.role === 'branchSecretary') return true;
  return state.currentUser.department === fileDeptId;
}

function canReturnFileFromFileDept(fileDeptId) {
  if (!state.currentUser) return false;
  if (state.currentUser.role === 'secretary' || state.currentUser.role === 'viceSecretary') return true;
  if (state.currentUser.role === 'minister' || state.currentUser.role === 'viceMinister') {
    return state.currentUser.department === fileDeptId;
  }
  return false;
}

function getTaskAssignedToLabel(assignedTo) {
  var assignment = parseAssignment(assignedTo);
  if (assignment.mode === 'all') return '所有人';
  var labels = [];
  getAssignmentOptions().forEach(function(opt) {
    if (assignment.tags.indexOf(opt.id) !== -1) labels.push(opt.label);
  });
  assignment.users.forEach(function(id) {
    var user = state.data.users.find(function(u) { return u.id === id; });
    if (user) labels.push(user.name);
  });
  return labels.length ? labels.join('、') : '部分可见';
}

function parseAssignment(value) {
  if (!value || value === 'all') return { mode: 'all', tags: ['all'], users: [] };
  if (value === 'branchSecretaries') return { mode: 'partial', tags: ['branch:all'], users: [] };
  try {
    var parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return {
      mode: parsed.mode === 'partial' ? 'partial' : 'all',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      users: Array.isArray(parsed.users) ? parsed.users : []
    };
  } catch (e) {
    return { mode: 'partial', tags: [], users: [value] };
  }
}

function serializeAssignmentFromPanel() {
  var tags = Array.from(document.querySelectorAll('#assignmentPanel input[data-tag]:checked')).map(function(i) { return i.getAttribute('data-tag'); });
  var users = Array.from(document.querySelectorAll('#assignmentPanel input[data-user]:checked')).map(function(i) { return i.getAttribute('data-user'); });
  if (tags.indexOf('all') !== -1) return 'all';
  return JSON.stringify({ mode: 'partial', tags: tags, users: users });
}

function getAssignmentOptions() {
  var opts = [
    { group: '团委工作人员', section: '团委（副）书记', id: 'committee:secretariat', label: '团委（副）书记' },
    { group: '团委工作人员', section: '部长', id: 'committee:leaders:all', label: '全体部长' },
    { group: '团委工作人员', section: '部门', id: 'committee:dept:all', label: '全部部门' },
    { group: '团支书', section: '全部', id: 'branch:all', label: '全体团支书' }
  ];
  state.data.departments.forEach(function(d) {
    var leaderTitle = d.name === '办公室' ? '主任' : '部长';
    opts.push({ group: '团委工作人员', section: '部长', id: 'committee:leaders:dept:' + d.id, label: d.name + leaderTitle });
    opts.push({ group: '团委工作人员', section: '部门', id: 'committee:dept:' + d.id, label: d.name });
  });
  return opts;
}

function userMatchesAssignmentTag(user, tag) {
  if (tag === 'all') return true;
  if (tag === 'committee:all') return user.role !== 'branchSecretary';
  if (tag === 'committee:secretariat') return user.role === 'secretary' || user.role === 'viceSecretary';
  if (tag === 'committee:leaders:all') return user.role === 'minister' || user.role === 'viceMinister';
  if (tag.indexOf('committee:leaders:dept:') === 0) return (user.role === 'minister' || user.role === 'viceMinister') && user.department === tag.replace('committee:leaders:dept:', '');
  if (tag === 'committee:dept:all') return user.role !== 'branchSecretary' && !!user.department;
  if (tag === 'branch:all') return user.role === 'branchSecretary';
  if (tag.indexOf('committee:role:') === 0) return user.role === tag.replace('committee:role:', '');
  if (tag.indexOf('committee:dept:') === 0) return user.role !== 'branchSecretary' && user.department === tag.replace('committee:dept:', '');
  if (tag.indexOf('branch:dept:') === 0) return user.role === 'branchSecretary' && user.department === tag.replace('branch:dept:', '');
  return false;
}

function canDeleteReturnedFile() {
  return state.currentUser && (state.currentUser.role === 'secretary' || state.currentUser.role === 'viceSecretary');
}

function getAssignedUsersForTask(task, branchOnly) {
  var assignment = parseAssignment(task.assignedTo);
  var users = state.data.users.slice();
  if (branchOnly) users = users.filter(function(u) { return u.role === 'branchSecretary'; });
  if (assignment.mode === 'all') return users;
  var ids = {};
  assignment.users.forEach(function(id) { ids[id] = true; });
  users.forEach(function(user) {
    if (assignment.tags.some(function(tag) { return userMatchesAssignmentTag(user, tag); })) ids[user.id] = true;
  });
  return users.filter(function(user) { return !!ids[user.id]; });
}

function renderAssignmentPanel(assignedTo) {
  var panel = document.getElementById('assignmentPanel');
  if (!panel) return;
  var assignment = parseAssignment(assignedTo);
  var selectedTags = assignment.mode === 'all' ? ['committee:all', 'branch:all'] : assignment.tags;
  var html = '<div class="assignment-tip">选择标签会派发给该标签下所有人，也可以直接选择具体人员。</div>';
  ['团委工作人员', '团支书'].forEach(function(group) {
    html += '<div class="assignment-group"><div class="assignment-group-title">' + group + '</div>';
    var sections = group === '团委工作人员' ? ['团委（副）书记', '部长', '部门'] : ['全部'];
    sections.forEach(function(section) {
      var opts = getAssignmentOptions().filter(function(opt) { return opt.group === group && opt.section === section; });
      if (!opts.length) return;
      html += '<div class="assignment-subtitle">' + section + '</div><div class="assignment-chip-wrap">';
      opts.forEach(function(opt) {
        html += '<label class="assignment-chip"><input type="checkbox" data-tag="' + opt.id + '"' + (selectedTags.indexOf(opt.id) !== -1 ? ' checked' : '') + ' onchange="onAssignmentCheck(this)"> ' + escHtml(opt.label) + '</label>';
      });
      html += '</div>';
    });
    var users = [];
    if (users.length) {
      html += '<div class="assignment-subtitle">选择人员</div><div class="assignment-chip-wrap">';
      users.forEach(function(user) {
        html += '<label class="assignment-chip"><input type="checkbox" data-user="' + user.id + '"' + (assignment.users.indexOf(user.id) !== -1 ? ' checked' : '') + ' onchange="onAssignmentCheck(this)"> ' + escHtml(user.name) + '</label>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  html += '<div id="assignmentSummary" class="assignment-summary"></div>';
  panel.innerHTML = html;
  updateAssignmentSummary();
}

function onAssignmentCheck(input) {
  if (input.checked && input.getAttribute('data-tag') === 'all') {
    Array.from(document.querySelectorAll('#assignmentPanel input[type="checkbox"]')).forEach(function(item) {
      if (item !== input) item.checked = false;
    });
  } else if (input.checked) {
    var all = document.querySelector('#assignmentPanel input[data-tag="all"]');
    if (all) all.checked = false;
  }
  updateAssignmentSummary();
}

function updateAssignmentSummary() {
  Array.from(document.querySelectorAll('#assignmentPanel .assignment-chip')).forEach(function(chip) {
    var input = chip.querySelector('input');
    chip.classList.toggle('selected', !!(input && input.checked));
  });
  var summary = document.getElementById('assignmentSummary');
  if (!summary) return;
  var value = serializeAssignmentFromPanel();
  document.getElementById('taskAssignedTo').value = value;
  summary.textContent = '当前：' + getTaskAssignedToLabel(value);
}

function showToast(msg, type) {
  type = type || 'info';
  var container = document.getElementById('toastContainer');
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(function() { t.classList.add('show'); }, 10);
  setTimeout(function() {
    t.classList.remove('show');
    setTimeout(function() { t.remove(); }, 300);
  }, 2500);
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function getUnreadCount() {
  var userId = state.currentUser ? state.currentUser.id : '';
  return state.data.notifications.filter(function(n) {
    return !n.read && (n.targetUser === 'all' || n.targetUser === userId);
  }).length;
}

function updateNotifBadge() {
  var badge = document.getElementById('notifBadge');
  var count = getUnreadCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function showLogin() {
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginPage').style.display = '';
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
}

function checkAuth() {
  return API.get('/api/auth/me').then(function(data) {
    state.currentUser = mapUser(data);
    return true;
  }).catch(function() {
    state.currentUser = null;
    return false;
  });
}

function handleLogin() {
  var username = document.getElementById('loginUsername').value.trim();
  var password = document.getElementById('loginPassword').value.trim();
  if (!username || !password) {
    showToast('请输入用户名和密码', 'error');
    return;
  }
  API.post('/api/auth/login', { username: username, password: password }).then(function(data) {
    state.currentUser = mapUser(data.user || data);
    state.isPreviousYear = false;
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').style.display = '';
    renderNavbar();
    renderSidebar();
    loadData().then(function() {
      renderContent();
      updateNotifBadge();
    });
    showToast('欢迎回来，' + state.currentUser.name, 'success');
  }).catch(function(err) {
    showToast(err.error || '用户名或密码错误', 'error');
  });
}

function handleLogout() {
  API.post('/api/auth/logout', {}).then(function() {
    state.currentUser = null;
    state.currentNav = 'tasks';
    state.fileFilter = 'all';
    state.searchQuery = '';
    state.deptDetailId = null;
    state.isPreviousYear = false;
    showLogin();
    showToast('已退出登录', 'info');
  }).catch(function() {
    state.currentUser = null;
    state.currentNav = 'tasks';
    state.fileFilter = 'all';
    state.searchQuery = '';
    state.deptDetailId = null;
    state.isPreviousYear = false;
    showLogin();
  });
}

function renderNavbar() {
  if (!state.currentUser) return;
  document.getElementById('navUserName').textContent = state.currentUser.name;
  var roleText = ROLE_MAP[state.currentUser.role] || '';
  if (state.currentUser.department) {
    roleText += ' · ' + getDeptName(state.currentUser.department);
  }
  document.getElementById('navUserRole').textContent = roleText;
}

function renderSidebar() {
  initYearSelector();
  renderMonthGrid();
  renderNavMenu();
}

function initYearSelector() {
  var sel = document.getElementById('yearSelector');
  sel.innerHTML = '';
  var current = new Date().getFullYear();
  for (var y = current + 1; y >= current - 5; y--) {
    var opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '年';
    if (y === state.currentYear) opt.selected = true;
    sel.appendChild(opt);
  }
}

function renderMonthGrid() {
  var grid = document.getElementById('monthGrid');
  grid.innerHTML = '';
  for (var m = 1; m <= 12; m++) {
    var btn = document.createElement('div');
    btn.className = 'month-btn' + (m === state.currentMonth ? ' active' : '');
    btn.textContent = m + '月';
    btn.setAttribute('data-month', m);
    btn.onclick = function() {
      state.currentMonth = parseInt(this.getAttribute('data-month'));
      renderMonthGrid();
      renderContent();
    };
    grid.appendChild(btn);
  }
}

function renderNavMenu() {
  var menu = document.getElementById('navMenu');
  menu.innerHTML = '';
  var items = [
    { key: 'tasks', icon: '📋', label: '任务管理' },
    { key: 'files', icon: '📁', label: '文件管理' },
    { key: 'departments', icon: '🏢', label: '部门空间' },
    { key: 'previousYear', icon: '📂', label: '去年任务' },
    { key: 'permissions', icon: '🔐', label: '权限管理' },
    { key: 'notifications', icon: '🔔', label: '通知中心' }
  ];
  items.forEach(function(item) {
    var li = document.createElement('li');
    var isActive = item.key === state.currentNav;
    if (item.key === 'departments' && state.currentNav === 'deptDetail') isActive = true;
    li.className = isActive ? 'active' : '';
    if (item.key === 'permissions' && !canManageUsers()) {
      li.className = 'disabled';
    }
    li.innerHTML = '<span>' + item.icon + '</span><span>' + item.label + '</span>';
    li.onclick = function() {
      if (item.key === 'permissions' && !canManageUsers()) return;
      state.deptDetailId = null;
      state.isPreviousYear = false;
      switchNav(item.key);
    };
    menu.appendChild(li);
  });
}

function switchNav(nav) {
  state.currentNav = nav;
  state.fileFilter = 'all';
  state.searchQuery = '';
  if (nav !== 'deptDetail') state.deptDetailId = null;
  renderNavMenu();
  renderContent();
  if (nav === 'notifications') {
    updateNotifBadge();
  }
}

function changeYear(year) {
  state.currentYear = parseInt(year);
  renderContent();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function renderContent() {
  var area = document.getElementById('contentArea');
  area.innerHTML = '';
  switch (state.currentNav) {
    case 'tasks': renderTasks(area); break;
    case 'files': renderFiles(area); break;
    case 'departments': renderDepartments(area); break;
    case 'deptDetail': renderDeptDetail(area); break;
    case 'previousYear': renderPreviousYear(area); break;
    case 'permissions': renderPermissions(area); break;
    case 'notifications': renderNotifications(area); break;
  }
}

function renderTasks(area) {
  var yearLabel = state.currentYear + '年' + state.currentMonth + '月';
  var header = document.createElement('div');
  header.className = 'content-header';
  var h2 = document.createElement('h2');
  h2.textContent = '任务管理 - ' + yearLabel;
  header.appendChild(h2);
  var actions = document.createElement('div');
  actions.className = 'actions';
  if (canPublishTask()) {
    var addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.innerHTML = '＋ 添加任务';
    addBtn.onclick = function() { openTaskModal(); };
    actions.appendChild(addBtn);
  }
  header.appendChild(actions);
  area.appendChild(header);

  var filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  var tabs = document.createElement('div');
  tabs.className = 'filter-tabs';
  [['all', '全部'], ['active', '进行中'], ['completed', '已完成']].forEach(function(item) {
    var btn = document.createElement('button');
    btn.className = 'filter-tab' + (state.fileFilter === item[0] ? ' active' : '');
    btn.textContent = item[1];
    btn.onclick = function() {
      state.fileFilter = item[0];
      renderContent();
    };
    tabs.appendChild(btn);
  });
  filterBar.appendChild(tabs);
  var search = document.createElement('input');
  search.type = 'text';
  search.className = 'search-box';
  search.placeholder = '搜索任务名称...';
  search.value = state.searchQuery;
  search.oninput = function() {
    state.searchQuery = this.value;
    renderContent();
  };
  filterBar.appendChild(search);
  area.appendChild(filterBar);

  var grid = document.createElement('div');
  grid.className = 'card-grid animate-in';

  var tasks = getFilteredTasks();
  if (!tasks.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📭</div><p>本月暂无任务</p></div>';
  } else {
    tasks.forEach(function(task) {
      grid.appendChild(createTaskCard(task));
    });
  }
  area.appendChild(grid);
}

function getFilteredTasks() {
  var tasks = state.data.tasks.filter(function(t) {
    return t.year === state.currentYear && (t.month === state.currentMonth || !t.month);
  });
  if (state.currentUser.role === 'minister' || state.currentUser.role === 'member') {
    tasks = tasks.filter(function(t) { return t.department === state.currentUser.department; });
  }
  if (state.fileFilter === 'active') {
    tasks = tasks.filter(function(t) { return t.status === 'active'; });
  } else if (state.fileFilter === 'completed') {
    tasks = tasks.filter(function(t) { return t.status === 'completed'; });
  }
  if (state.searchQuery) {
    var q = state.searchQuery.toLowerCase();
    tasks = tasks.filter(function(t) {
      return t.title.toLowerCase().indexOf(q) !== -1 || (t.description && t.description.toLowerCase().indexOf(q) !== -1);
    });
  }
  return tasks;
}

function createTaskCard(task) {
  var card = document.createElement('div');
  card.className = 'task-card';
  var subCount = state.data.fileSubmissions.filter(function(f) { return f.taskId === task.id; }).length;
  var sumCount = state.data.summaryFiles.filter(function(f) { return f.taskId === task.id; }).length;
  var statusLabel = task.status === 'completed' ? '已完成' : '进行中';
  var statusClass = task.status === 'completed' ? 'completed' : 'active';
  var deptColor = getDeptColor(task.department);
  var actionsHtml = '';
  actionsHtml += '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openTaskDetail(\'' + task.id + '\')">详情</button>';
  if (canCurrentUserSubmitTask(task)) {
    actionsHtml += '<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openFileSubmit(\'' + task.id + '\')">提交文件</button>';
  }
  if (canUploadSummary() && canAccessDept(task.department)) {
    actionsHtml += '<button class="btn btn-success btn-sm" onclick="event.stopPropagation();openSummaryUpload(\'' + task.id + '\')">上传汇总</button>';
  }
  if (canDeleteTask()) {
    actionsHtml += '<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteTask(\'' + task.id + '\')">删除</button>';
  }
  var timeStr = '';
  if (task.month) timeStr += task.month + '月';
  if (task.day) timeStr += task.day + '日';
  if (task.timeSlot) timeStr += ' ' + task.timeSlot;
  card.innerHTML =
    '<div class="card-accent" style="background:' + deptColor + '"></div>' +
    '<div class="card-top">' +
      '<span class="card-name">' + escHtml(task.title) + '</span>' +
      '<span class="card-status ' + statusClass + '">' + statusLabel + '</span>' +
    '</div>' +
    '<div class="card-meta">' +
      '<span class="tag ' + (CAT_TAG_CLASS[task.category] || 'tag-other') + '">' + escHtml(task.category) + '</span>' +
      '<span class="tag tag-other">' + escHtml(task.frequency) + '</span>' +
      '<span class="tag tag-dept" style="background:' + deptColor + '">' + escHtml(getDeptName(task.department)) + '</span>' +
      '<span class="tag tag-other">' + escHtml(getTaskAssignedToLabel(task.assignedTo)) + '</span>' +
      (task.isRegular ? '<span class="tag tag-learn">常态化</span>' : '<span class="tag tag-activity">一次性</span>') +
    '</div>' +
    (task.description ? '<div class="card-desc">' + escHtml(task.description) + '</div>' : '') +
    (timeStr ? '<div class="card-time">🕐 ' + escHtml(timeStr) + '</div>' : '') +
    '<div class="card-meta" style="margin-bottom:8px">' +
      '<span class="tag tag-learn">📎 提交 ' + subCount + '</span>' +
      '<span class="tag tag-daily">📋 汇总 ' + sumCount + '</span>' +
    '</div>' +
    '<div class="card-actions">' + actionsHtml + '</div>';
  card.onclick = function() { openTaskDetail(task.id); };
  return card;
}

function initTaskMonthOptions() {
  var sel = document.getElementById('taskMonth');
  sel.innerHTML = '<option value="">不限</option>';
  for (var m = 1; m <= 12; m++) {
    var opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m + '月';
    sel.appendChild(opt);
  }
}

function initTaskDeptOptions() {
  var sel = document.getElementById('taskDepartment');
  sel.innerHTML = '';
  if (state.currentUser.role === 'secretary' || state.currentUser.role === 'viceSecretary') {
    state.data.departments.forEach(function(d) {
      var opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      sel.appendChild(opt);
    });
  } else if (state.currentUser.role === 'minister') {
    var dept = state.data.departments.find(function(d) { return d.id === state.currentUser.department; });
    if (dept) {
      var opt = document.createElement('option');
      opt.value = dept.id;
      opt.textContent = dept.name;
      sel.appendChild(opt);
    }
  }
}

function syncTaskFrequencyVisibility() {
  var isRegular = document.getElementById('taskIsRegular').value === 'true';
  var frequency = document.getElementById('taskFrequency');
  var group = frequency.closest('.form-group');
  frequency.value = '每年';
  if (group) group.style.display = isRegular ? '' : 'none';
}

function openTaskModal(editId) {
  initTaskMonthOptions();
  initTaskDeptOptions();
  document.getElementById('taskEditId').value = editId || '';
  if (editId) {
    var task = state.data.tasks.find(function(t) { return t.id === editId; });
    if (!task) return;
    document.getElementById('taskModalTitle').textContent = '编辑任务';
    document.getElementById('taskTitle').value = task.title || '';
    document.getElementById('taskDepartment').value = task.department || '';
    document.getElementById('taskCategory').value = task.category || '组织生活';
    document.getElementById('taskFrequency').value = '每年';
    document.getElementById('taskTimeSlot').value = task.timeSlot || '';
    document.getElementById('taskMonth').value = task.month || '';
    document.getElementById('taskDay').value = task.day || '';
    document.getElementById('taskAssignedTo').value = task.assignedTo || 'all';
    renderAssignmentPanel(task.assignedTo || 'all');
    document.getElementById('taskIsRegular').value = task.isRegular ? 'true' : 'false';
    document.getElementById('taskDesc').value = task.description || '';
  } else {
    document.getElementById('taskModalTitle').textContent = '添加任务';
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskCategory').value = '组织生活';
    document.getElementById('taskFrequency').value = '每年';
    document.getElementById('taskTimeSlot').value = '';
    document.getElementById('taskMonth').value = state.currentMonth;
    document.getElementById('taskDay').value = '';
    document.getElementById('taskAssignedTo').value = 'all';
    renderAssignmentPanel('all');
    document.getElementById('taskIsRegular').value = 'true';
    document.getElementById('taskDesc').value = '';
  }
  syncTaskFrequencyVisibility();
  document.getElementById('taskModalOverlay').classList.add('active');
}

function closeTaskModal() {
  document.getElementById('taskModalOverlay').classList.remove('active');
}

function saveTask() {
  var title = document.getElementById('taskTitle').value.trim();
  if (!title) { showToast('请输入任务名称', 'error'); return; }
  var department = document.getElementById('taskDepartment').value;
  if (!department) { showToast('请选择所属部门', 'error'); return; }
  var editId = document.getElementById('taskEditId').value;
  var isRegular = document.getElementById('taskIsRegular').value === 'true';
  document.getElementById('taskAssignedTo').value = serializeAssignmentFromPanel();
  var selectedTags = document.querySelectorAll('#assignmentPanel input[data-tag]:checked').length;
  var selectedUsers = document.querySelectorAll('#assignmentPanel input[data-user]:checked').length;
  if (!selectedTags && !selectedUsers) { showToast('请选择派发标签或人员', 'error'); return; }
  var formData = {
    title: title,
    department_id: department,
    category: document.getElementById('taskCategory').value,
    frequency: isRegular ? '每年' : '不定期',
    time_slot: document.getElementById('taskTimeSlot').value.trim(),
    month: document.getElementById('taskMonth').value ? parseInt(document.getElementById('taskMonth').value) : null,
    day: document.getElementById('taskDay').value ? parseInt(document.getElementById('taskDay').value) : null,
    assigned_to: document.getElementById('taskAssignedTo').value,
    is_regular: isRegular,
    description: document.getElementById('taskDesc').value.trim()
  };

  var promise;
  if (editId) {
    promise = API.put('/api/tasks/' + editId, formData);
  } else {
    formData.year = state.currentYear;
    promise = API.post('/api/tasks', formData);
  }
  promise.then(function() {
    closeTaskModal();
    loadData().then(function() {
      renderContent();
      showToast(editId ? '任务已更新' : '任务已添加', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '操作失败', 'error');
  });
}

function deleteTask(id) {
  if (!confirm('确定要删除此任务吗？')) return;
  API.del('/api/tasks/' + id).then(function() {
    loadData().then(function() {
      renderContent();
      showToast('任务已删除', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '删除失败', 'error');
  });
}

function openTaskDetail(taskId) {
  var task = state.data.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  document.getElementById('taskDetailTitle').textContent = task.title;
  var body = document.getElementById('taskDetailBody');
  body.innerHTML = '';

  var deptColor = getDeptColor(task.department);

  var info = document.createElement('div');
  info.className = 'task-detail-section';
  info.innerHTML =
    '<h4>基本信息</h4>' +
    '<p style="font-size:13px;line-height:1.8;color:var(--text2)">' +
      '<strong>所属部门：</strong><span style="color:' + deptColor + ';font-weight:600">' + escHtml(getDeptName(task.department)) + '</span><br>' +
      '<strong>类别：</strong>' + escHtml(task.category) + '<br>' +
      '<strong>频次：</strong>' + escHtml(task.frequency) + '<br>' +
      '<strong>类型：</strong>' + (task.isRegular ? '常态化' : '一次性') + '<br>' +
      '<strong>指派给：</strong>' + escHtml(getTaskAssignedToLabel(task.assignedTo)) + '<br>' +
      '<strong>状态：</strong>' + (task.status === 'completed' ? '已完成' : '进行中') + '<br>' +
      (task.month ? '<strong>月份：</strong>' + task.month + '月<br>' : '') +
      (task.day ? '<strong>日期：</strong>' + task.day + '日<br>' : '') +
      (task.timeSlot ? '<strong>时间段：</strong>' + escHtml(task.timeSlot) + '<br>' : '') +
      (task.description ? '<strong>描述：</strong>' + escHtml(task.description) + '<br>' : '') +
    '</p>';
  if (canPublishTask() || state.currentUser.role === 'secretary') {
    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn ' + (task.status === 'completed' ? 'btn-warning' : 'btn-success') + ' btn-sm';
    toggleBtn.style.marginTop = '8px';
    toggleBtn.textContent = task.status === 'completed' ? '标记为进行中' : '标记为已完成';
    toggleBtn.onclick = function() {
      var newStatus = task.status === 'completed' ? 'active' : 'completed';
      API.put('/api/tasks/' + taskId, { status: newStatus }).then(function() {
        loadData().then(function() {
          openTaskDetail(taskId);
          renderContent();
          showToast('状态已更新', 'success');
        });
      }).catch(function(err) {
        showToast(err.error || '更新失败', 'error');
      });
    };
    info.appendChild(toggleBtn);
  }
  body.appendChild(info);

  var subs = state.data.fileSubmissions.filter(function(f) { return f.taskId === taskId; });
  if (state.currentUser.role === 'minister' || state.currentUser.role === 'member') {
    subs = subs.filter(function(f) { return f.department === state.currentUser.department; });
  }
  body.appendChild(createCompletionSection(task, subs));
  var subSection = document.createElement('div');
  subSection.className = 'task-detail-section';
  subSection.innerHTML = '<h4>文件提交 (' + subs.length + ')</h4>';
  if (canCurrentUserSubmitTask(task)) {
    var submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary btn-sm';
    submitBtn.style.marginBottom = '10px';
    submitBtn.textContent = '提交文件';
    submitBtn.onclick = function() { openFileSubmit(taskId); };
    subSection.appendChild(submitBtn);
  }
  if (!subs.length) {
    subSection.innerHTML += '<p style="font-size:13px;color:var(--text3)">暂无文件提交</p>';
  } else {
    subs.forEach(function(sub) {
      var item = document.createElement('div');
      item.className = 'submission-item';
      var statusHtml = '';
      if (sub.status === 'pending') statusHtml = '<span class="sub-status status-pending">待审核</span>';
      else if (sub.status === 'approved') statusHtml = '<span class="sub-status status-approved">已通过</span>';
      else statusHtml = '<span class="sub-status status-returned">已打回</span>';
      var actionsHtml = '<button class="btn btn-secondary btn-sm" onclick="downloadSubmission(\'' + sub.id + '\')">下载</button>';
      if (sub.status === 'pending' && canReturnFileFromFileDept(sub.department)) {
        actionsHtml += ' <button class="btn btn-success btn-sm" onclick="approveFile(\'' + sub.id + '\')">通过</button>';
        actionsHtml += ' <button class="btn btn-danger btn-sm" onclick="openReturnModal(\'' + sub.id + '\')">打回</button>';
      }
      if (sub.status === 'returned' && canDeleteReturnedFile()) {
        actionsHtml += ' <button class="btn btn-danger btn-sm" onclick="deleteReturnedSubmission(\'' + sub.id + '\')">删除记录</button>';
      }
      var returnReasonHtml = '';
      if (sub.status === 'returned' && sub.returnReason) {
        returnReasonHtml = '<div class="return-reason-box">打回原因：' + escHtml(sub.returnReason) + '</div>';
      }
      item.innerHTML =
        '<div class="sub-info">' +
          '<div class="sub-name">' + escHtml(sub.fileName) + '</div>' +
          '<div class="sub-meta">提交人：' + escHtml(sub.submittedByName) + ' · ' + formatTime(sub.submittedAt) + '</div>' +
          returnReasonHtml +
        '</div>' +
        statusHtml + ' ' + actionsHtml;
      subSection.appendChild(item);
    });
  }
  body.appendChild(subSection);

  var sums = state.data.summaryFiles.filter(function(f) { return f.taskId === taskId; });
  if (state.currentUser.role === 'minister' || state.currentUser.role === 'member') {
    sums = sums.filter(function(f) { return f.department === state.currentUser.department; });
  }
  var sumSection = document.createElement('div');
  sumSection.className = 'task-detail-section';
  sumSection.innerHTML = '<h4>汇总文件 (' + sums.length + ')</h4>';
  if (canUploadSummary() && canAccessDept(task.department)) {
    var sumBtn = document.createElement('button');
    sumBtn.className = 'btn btn-success btn-sm';
    sumBtn.style.marginBottom = '10px';
    sumBtn.textContent = '上传汇总文件';
    sumBtn.onclick = function() { openSummaryUpload(taskId); };
    sumSection.appendChild(sumBtn);
  }
  if (!sums.length) {
    sumSection.innerHTML += '<p style="font-size:13px;color:var(--text3)">暂无汇总文件</p>';
  } else {
    sums.forEach(function(sum) {
      var item = document.createElement('div');
      item.className = 'summary-item';
      var uploader = state.data.users.find(function(u) { return u.id === sum.uploadedBy; });
      item.innerHTML =
        '<div class="sum-info">' +
          '<div class="sum-name">' + escHtml(sum.fileName) + '</div>' +
          '<div class="sum-meta">上传人：' + escHtml(uploader ? uploader.name : '未知') + ' · ' + formatTime(sum.uploadedAt) + '</div>' +
        '</div>' +
        '<button class="btn btn-secondary btn-sm" onclick="downloadSummary(\'' + sum.id + '\')">下载</button>';
      sumSection.appendChild(item);
    });
  }
  body.appendChild(sumSection);

  document.getElementById('taskDetailOverlay').classList.add('active');
}

function closeTaskDetail() {
  document.getElementById('taskDetailOverlay').classList.remove('active');
}

function createCompletionSection(task, subs) {
  var section = document.createElement('div');
  section.className = 'task-detail-section';
  var targets = getAssignedUsersForTask(task, true);
  var submitted = {};
  subs.forEach(function(sub) {
    if (sub.status !== 'returned') submitted[sub.submittedBy] = true;
  });
  var done = targets.filter(function(user) { return submitted[user.id]; }).length;
  section.innerHTML =
    '<div class="completion-head">' +
      '<div class="completion-title">完成情况（' + done + '/' + targets.length + '）</div>' +
      '<div class="completion-tools">' +
        '<input class="completion-search" id="completionSearch_' + task.id + '" placeholder="搜索" oninput="renderCompletionGrid(\'' + task.id + '\')">' +
        '<button class="btn btn-secondary btn-sm" onclick="notifyUnsubmitted(\'' + task.id + '\')">通知未填人员</button>' +
      '</div>' +
    '</div>' +
    '<div class="completion-grid" id="completionGrid_' + task.id + '"></div>';
  setTimeout(function() { renderCompletionGrid(task.id); }, 0);
  return section;
}

function renderCompletionGrid(taskId) {
  var task = state.data.tasks.find(function(t) { return t.id === taskId; });
  var grid = document.getElementById('completionGrid_' + taskId);
  if (!task || !grid) return;
  var qEl = document.getElementById('completionSearch_' + taskId);
  var q = qEl ? qEl.value.trim().toLowerCase() : '';
  var targets = getAssignedUsersForTask(task, true);
  var subs = state.data.fileSubmissions.filter(function(f) { return f.taskId === taskId && f.status !== 'returned'; });
  var submitted = {};
  subs.forEach(function(sub) { submitted[sub.submittedBy] = true; });
  if (q) targets = targets.filter(function(user) { return user.name.toLowerCase().indexOf(q) !== -1; });
  if (!targets.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;font-size:13px;color:var(--text3)">该任务未指派团支书提交文件</p>';
    return;
  }
  grid.innerHTML = '';
  targets.forEach(function(user, idx) {
    var card = document.createElement('div');
    card.className = 'completion-card' + (submitted[user.id] ? ' done' : '');
    card.innerHTML = '<div class="corner">✓</div><div class="idx">' + (idx + 1) + '</div><div class="name">' + escHtml(user.name) + '</div>';
    grid.appendChild(card);
  });
}

function notifyUnsubmitted(taskId) {
  var task = state.data.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  var targets = getAssignedUsersForTask(task, true);
  var subs = state.data.fileSubmissions.filter(function(f) { return f.taskId === taskId && f.status !== 'returned'; });
  var submitted = {};
  subs.forEach(function(sub) { submitted[sub.submittedBy] = true; });
  var names = targets.filter(function(user) { return !submitted[user.id]; }).map(function(user) { return user.name; });
  showToast(names.length ? ('未提交：' + names.join('、')) : '已全部提交', names.length ? 'warning' : 'success');
}

function openFileSubmit(taskId) {
  document.getElementById('fileSubmitTaskId').value = taskId;
  state.resubmitFileId = null;
  state.pendingFiles = [];
  document.getElementById('pendingFileList').innerHTML = '';
  document.getElementById('fileInput').value = '';
  setupFileDropZone();
  document.getElementById('fileSubmitOverlay').classList.add('active');
}

function closeFileSubmit() {
  document.getElementById('fileSubmitOverlay').classList.remove('active');
  state.pendingFiles = [];
  state.resubmitFileId = null;
}

function setupFileDropZone() {
  var zone = document.getElementById('fileDropZone');
  zone.ondragover = function(e) { e.preventDefault(); zone.classList.add('dragover'); };
  zone.ondragleave = function(e) { e.preventDefault(); zone.classList.remove('dragover'); };
  zone.ondrop = function(e) {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFileSelect(e.dataTransfer.files);
  };
}

function handleFileSelect(fileList) {
  if (!fileList || !fileList.length) return;
  Array.from(fileList).forEach(function(file) {
    state.pendingFiles.push(file);
  });
  renderPendingFiles();
}

function renderPendingFiles() {
  var list = document.getElementById('pendingFileList');
  list.innerHTML = '';
  state.pendingFiles.forEach(function(f, idx) {
    var li = document.createElement('li');
    li.className = 'file-item';
    var icon = getFileIcon(f.name);
    li.innerHTML =
      '<span class="file-icon">' + icon + '</span>' +
      '<div class="file-info">' +
        '<div class="file-name">' + escHtml(f.name) + '</div>' +
        '<div class="file-meta">' + formatSize(f.size) + '</div>' +
      '</div>' +
      '<button class="btn btn-danger btn-sm" onclick="removePendingFile(' + idx + ')">移除</button>';
    list.appendChild(li);
  });
}

function removePendingFile(idx) {
  state.pendingFiles.splice(idx, 1);
  renderPendingFiles();
}

function confirmFileSubmit() {
  if (!state.pendingFiles.length) {
    showToast('请选择要提交的文件', 'error');
    return;
  }
  var taskId = document.getElementById('fileSubmitTaskId').value;
  var task = state.data.tasks.find(function(t) { return t.id === taskId; });
  if (!task) { showToast('任务不存在', 'error'); return; }
  if (state.resubmitFileId) {
    if (state.pendingFiles.length !== 1) {
      showToast('重新提交请选择一个替换文件', 'error');
      return;
    }
    var replacement = new FormData();
    replacement.append('file', state.pendingFiles[0]);
    API.uploadPut('/api/files/' + state.resubmitFileId + '/resubmit', replacement).then(function() {
      closeFileSubmit();
      state.resubmitFileId = null;
      loadData().then(function() {
        renderContent();
        showToast('文件已重新提交', 'success');
      });
    }).catch(function(err) {
      showToast(err.error || '重新提交失败', 'error');
    });
    return;
  }
  var promises = state.pendingFiles.map(function(file) {
    var formData = new FormData();
    formData.append('task_id', taskId);
    formData.append('file', file);
    return API.upload('/api/files', formData);
  });
  Promise.all(promises).then(function() {
    closeFileSubmit();
    loadData().then(function() {
      renderContent();
      showToast('文件提交成功', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '提交失败', 'error');
  });
}

function openSummaryUpload(taskId) {
  document.getElementById('summaryTaskId').value = taskId;
  state.pendingSummaryFiles = [];
  document.getElementById('pendingSummaryList').innerHTML = '';
  document.getElementById('summaryFileInput').value = '';
  setupSummaryDropZone();
  document.getElementById('summaryUploadOverlay').classList.add('active');
}

function closeSummaryUpload() {
  document.getElementById('summaryUploadOverlay').classList.remove('active');
  state.pendingSummaryFiles = [];
}

function setupSummaryDropZone() {
  var zone = document.getElementById('summaryDropZone');
  zone.ondragover = function(e) { e.preventDefault(); zone.classList.add('dragover'); };
  zone.ondragleave = function(e) { e.preventDefault(); zone.classList.remove('dragover'); };
  zone.ondrop = function(e) {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleSummarySelect(e.dataTransfer.files);
  };
}

function handleSummarySelect(fileList) {
  if (!fileList || !fileList.length) return;
  Array.from(fileList).forEach(function(file) {
    state.pendingSummaryFiles.push(file);
  });
  renderPendingSummary();
}

function renderPendingSummary() {
  var list = document.getElementById('pendingSummaryList');
  list.innerHTML = '';
  state.pendingSummaryFiles.forEach(function(f, idx) {
    var li = document.createElement('li');
    li.className = 'file-item';
    var icon = getFileIcon(f.name);
    li.innerHTML =
      '<span class="file-icon">' + icon + '</span>' +
      '<div class="file-info">' +
        '<div class="file-name">' + escHtml(f.name) + '</div>' +
        '<div class="file-meta">' + formatSize(f.size) + '</div>' +
      '</div>' +
      '<button class="btn btn-danger btn-sm" onclick="removePendingSummary(' + idx + ')">移除</button>';
    list.appendChild(li);
  });
}

function removePendingSummary(idx) {
  state.pendingSummaryFiles.splice(idx, 1);
  renderPendingSummary();
}

function confirmSummaryUpload() {
  if (!state.pendingSummaryFiles.length) {
    showToast('请选择要上传的汇总文件', 'error');
    return;
  }
  var taskId = document.getElementById('summaryTaskId').value;
  var promises = state.pendingSummaryFiles.map(function(file) {
    var formData = new FormData();
    formData.append('task_id', taskId);
    formData.append('file', file);
    return API.upload('/api/summary', formData);
  });
  Promise.all(promises).then(function() {
    closeSummaryUpload();
    loadData().then(function() {
      renderContent();
      showToast('汇总文件上传成功', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '上传失败', 'error');
  });
}

function getFileIcon(name) {
  var ext = name.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].indexOf(ext) !== -1) return '🖼️';
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx'].indexOf(ext) !== -1) return '📘';
  if (['xls', 'xlsx'].indexOf(ext) !== -1) return '📗';
  if (['ppt', 'pptx'].indexOf(ext) !== -1) return '📙';
  if (['zip', 'rar', '7z'].indexOf(ext) !== -1) return '🗜️';
  return '📄';
}

function downloadSubmission(subId) {
  window.open('/api/files/' + subId + '/download');
  showToast('开始下载', 'info');
}

function downloadSummary(sumId) {
  window.open('/api/summary/' + sumId + '/download');
  showToast('开始下载', 'info');
}

function approveFile(subId) {
  API.put('/api/files/' + subId + '/approve', {}).then(function() {
    loadData().then(function() {
      renderContent();
      showToast('文件已通过', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '操作失败', 'error');
  });
}

function openReturnModal(subId) {
  document.getElementById('returnFileId').value = subId;
  document.getElementById('returnReason').value = '';
  document.getElementById('returnModalOverlay').classList.add('active');
}

function closeReturnModal() {
  document.getElementById('returnModalOverlay').classList.remove('active');
}

function confirmReturn() {
  var subId = document.getElementById('returnFileId').value;
  var reason = document.getElementById('returnReason').value.trim();
  if (!reason) {
    showToast('请输入打回原因', 'error');
    return;
  }
  API.put('/api/files/' + subId + '/return', { reason: reason }).then(function() {
    closeReturnModal();
    loadData().then(function() {
      renderContent();
      showToast('文件已打回', 'info');
    });
  }).catch(function(err) {
    showToast(err.error || '操作失败', 'error');
  });
}

function resubmitFile(subId) {
  var sub = state.data.fileSubmissions.find(function(f) { return f.id === subId; });
  if (!sub) {
    showToast('文件不存在', 'error');
    return;
  }
  state.resubmitFileId = subId;
  document.getElementById('fileSubmitTaskId').value = sub.taskId;
  state.pendingFiles = [];
  document.getElementById('pendingFileList').innerHTML = '';
  document.getElementById('fileInput').value = '';
  setupFileDropZone();
  document.getElementById('fileSubmitOverlay').classList.add('active');
}

function deleteReturnedSubmission(subId) {
  if (!confirm('确定删除这条已打回提交记录吗？')) return;
  API.del('/api/files/' + subId).then(function() {
    loadData().then(function() {
      renderContent();
      showToast('提交记录已删除', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '删除失败', 'error');
  });
}

function renderFiles(area) {
  var header = document.createElement('div');
  header.className = 'content-header';
  var h2 = document.createElement('h2');
  h2.textContent = '文件管理';
  header.appendChild(h2);
  area.appendChild(header);

  var filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  var tabs = document.createElement('div');
  tabs.className = 'filter-tabs';
  [['all', '全部'], ['pending', '待审核'], ['approved', '已通过'], ['returned', '已打回']].forEach(function(item) {
    var btn = document.createElement('button');
    btn.className = 'filter-tab' + (state.fileFilter === item[0] ? ' active' : '');
    btn.textContent = item[1];
    btn.onclick = function() {
      state.fileFilter = item[0];
      renderContent();
    };
    tabs.appendChild(btn);
  });
  filterBar.appendChild(tabs);

  if (canViewAllDepts()) {
    var deptFilter = document.createElement('select');
    deptFilter.style.cssText = 'padding:7px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none';
    deptFilter.innerHTML = '<option value="all">全部部门</option>';
    state.data.departments.forEach(function(d) {
      deptFilter.innerHTML += '<option value="' + d.id + '">' + escHtml(d.name) + '</option>';
    });
    deptFilter.value = state.deptFileFilter || 'all';
    deptFilter.onchange = function() {
      state.deptFileFilter = this.value;
      renderContent();
    };
    filterBar.appendChild(deptFilter);
  }

  var search = document.createElement('input');
  search.type = 'text';
  search.className = 'search-box';
  search.placeholder = '搜索文件名...';
  search.value = state.searchQuery;
  search.oninput = function() {
    state.searchQuery = this.value;
    renderContent();
  };
  filterBar.appendChild(search);
  area.appendChild(filterBar);

  var grid = document.createElement('div');
  grid.className = 'card-grid animate-in';

  var subs = getFilteredSubmissions();
  if (!subs.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📁</div><p>暂无文件记录</p></div>';
  } else {
    subs.forEach(function(sub) {
      grid.appendChild(createFileCard(sub));
    });
  }
  area.appendChild(grid);
}

function getFilteredSubmissions() {
  var subs = state.data.fileSubmissions.slice();
  if (state.currentUser.role === 'branchSecretary') {
    subs = subs.filter(function(f) { return f.submittedBy === state.currentUser.id; });
  } else if (state.currentUser.role === 'minister' || state.currentUser.role === 'member') {
    subs = subs.filter(function(f) { return f.department === state.currentUser.department; });
  } else if (canViewAllDepts() && state.deptFileFilter && state.deptFileFilter !== 'all') {
    subs = subs.filter(function(f) { return f.department === state.deptFileFilter; });
  }
  if (state.fileFilter !== 'all') {
    subs = subs.filter(function(f) { return f.status === state.fileFilter; });
  }
  if (state.searchQuery) {
    var q = state.searchQuery.toLowerCase();
    subs = subs.filter(function(f) {
      return f.fileName.toLowerCase().indexOf(q) !== -1;
    });
  }
  subs.sort(function(a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });
  return subs;
}

function createFileCard(sub) {
  var card = document.createElement('div');
  card.className = 'file-card';
  var accentClass = 'accent-' + sub.status;
  var statusLabel = sub.status === 'pending' ? '待审核' : sub.status === 'approved' ? '已通过' : '已打回';
  var task = state.data.tasks.find(function(t) { return t.id === sub.taskId; });
  var taskName = task ? task.title : '未知任务';
  var deptName = getDeptName(sub.department);
  var deptColor = getDeptColor(sub.department);
  var actionsHtml = '<button class="btn btn-secondary btn-sm" onclick="downloadSubmission(\'' + sub.id + '\')">下载</button>';
  if (sub.status === 'pending' && canReturnFileFromFileDept(sub.department)) {
    actionsHtml += ' <button class="btn btn-success btn-sm" onclick="approveFile(\'' + sub.id + '\')">通过</button>';
    actionsHtml += ' <button class="btn btn-danger btn-sm" onclick="openReturnModal(\'' + sub.id + '\')">打回</button>';
  }
  if (sub.status === 'returned' && state.currentUser.role === 'branchSecretary' && sub.submittedBy === state.currentUser.id) {
    actionsHtml += ' <button class="btn btn-primary btn-sm" onclick="resubmitFile(\'' + sub.id + '\')">重新提交</button>';
  }
  if (sub.status === 'returned' && canDeleteReturnedFile()) {
    actionsHtml += ' <button class="btn btn-danger btn-sm" onclick="deleteReturnedSubmission(\'' + sub.id + '\')">删除记录</button>';
  }
  var returnReasonHtml = '';
  if (sub.status === 'returned' && sub.returnReason) {
    returnReasonHtml = '<div class="return-reason-box">打回原因：' + escHtml(sub.returnReason) + '</div>';
  }
  card.innerHTML =
    '<div class="card-accent ' + accentClass + '"></div>' +
    '<div class="card-top">' +
      '<span class="card-name">' + escHtml(sub.fileName) + '</span>' +
      '<span class="status-badge status-' + sub.status + '">' + statusLabel + '</span>' +
    '</div>' +
    '<div class="card-info">' +
      '<strong>所属部门：</strong><span style="color:' + deptColor + ';font-weight:600">' + escHtml(deptName) + '</span><br>' +
      '<strong>关联任务：</strong>' + escHtml(taskName) + '<br>' +
      '<strong>提交人：</strong>' + escHtml(sub.submittedByName) + '<br>' +
      '<strong>提交时间：</strong>' + formatTime(sub.submittedAt) + '<br>' +
      '<strong>文件大小：</strong>' + formatSize(sub.fileSize) +
    '</div>' +
    returnReasonHtml +
    '<div class="card-actions">' + actionsHtml + '</div>';
  return card;
}

function renderDepartments(area) {
  var header = document.createElement('div');
  header.className = 'content-header';
  var h2 = document.createElement('h2');
  h2.textContent = '部门空间';
  header.appendChild(h2);
  area.appendChild(header);

  var userDept = getUserDept();
  if (userDept && (state.currentUser.role === 'minister' || state.currentUser.role === 'member')) {
    state.deptDetailId = userDept.id;
    state.currentNav = 'deptDetail';
    renderDeptDetail(area);
    return;
  }

  var grid = document.createElement('div');
  grid.className = 'dept-grid animate-in';
  var depts = state.data.departments.slice();
  if (!depts.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🏢</div><p>暂无部门</p></div>';
  } else {
    depts.forEach(function(dept) {
      var card = document.createElement('div');
      card.className = 'dept-card';
      var color = dept.color || '#999';
      var minister = state.data.users.find(function(u) { return u.id === dept.ministerId; });
      var member = state.data.users.find(function(u) { return u.id === dept.memberId; });
      var taskCount = state.data.tasks.filter(function(t) { return t.department === dept.id; }).length;
      var fileCount = state.data.fileSubmissions.filter(function(f) { return f.department === dept.id; }).length;
      card.innerHTML =
        '<div class="dept-accent" style="background:' + color + '"></div>' +
        '<div class="dept-icon" style="color:' + color + '">🏢</div>' +
        '<div class="dept-name" style="color:' + color + '">' + escHtml(dept.name) + '</div>' +
        '<div class="dept-info">' +
          '部长：' + escHtml(minister ? minister.name : '未设置') + '<br>' +
          '部员：' + escHtml(member ? member.name : '未设置') + '<br>' +
          '任务数：' + taskCount + ' · 文件数：' + fileCount +
        '</div>';
      card.onclick = function() {
        state.deptDetailId = dept.id;
        state.currentNav = 'deptDetail';
        state.deptDetailTab = 'tasks';
        renderNavMenu();
        renderContent();
      };
      grid.appendChild(card);
    });
  }
  area.appendChild(grid);
}

function renderDeptDetail(area) {
  var deptId = state.deptDetailId;
  var dept = state.data.departments.find(function(d) { return d.id === deptId; });
  if (!dept) {
    area.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><p>部门不存在</p></div>';
    return;
  }
  var color = dept.color || '#999';
  var minister = state.data.users.find(function(u) { return u.id === dept.ministerId; });
  var member = state.data.users.find(function(u) { return u.id === dept.memberId; });

  var headerDiv = document.createElement('div');
  headerDiv.className = 'dept-detail-header';
  headerDiv.innerHTML =
    '<div class="dept-icon-lg" style="color:' + color + '">🏢</div>' +
    '<div>' +
      '<div class="dept-title" style="color:' + color + '">' + escHtml(dept.name) + '</div>' +
      '<div class="dept-subtitle">部长：' + escHtml(minister ? minister.name : '未设置') + ' · 部员：' + escHtml(member ? member.name : '未设置') + '</div>' +
    '</div>' +
    '<button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="state.deptDetailId=null;state.currentNav=\'departments\';renderNavMenu();renderContent()">← 返回</button>';
  area.appendChild(headerDiv);

  var tabs = document.createElement('div');
  tabs.className = 'dept-detail-tabs';
  var tabItems = [
    { key: 'tasks', label: '📋 任务列表' },
    { key: 'files', label: '📁 文件提交' },
    { key: 'summary', label: '📋 汇总文件' },
    { key: 'members', label: '👥 成员信息' }
  ];
  tabItems.forEach(function(item) {
    var btn = document.createElement('button');
    btn.className = 'dept-detail-tab' + (state.deptDetailTab === item.key ? ' active' : '');
    btn.textContent = item.label;
    btn.onclick = function() {
      state.deptDetailTab = item.key;
      renderContent();
    };
    tabs.appendChild(btn);
  });
  area.appendChild(tabs);

  var content = document.createElement('div');
  content.className = 'animate-in';

  switch (state.deptDetailTab) {
    case 'tasks': renderDeptTasks(content, dept); break;
    case 'files': renderDeptFiles(content, dept); break;
    case 'summary': renderDeptSummary(content, dept); break;
    case 'members': renderDeptMembers(content, dept); break;
  }
  area.appendChild(content);
}

function renderDeptTasks(container, dept) {
  var tasks = state.data.tasks.filter(function(t) {
    return t.department === dept.id && t.year === state.currentYear;
  });
  if (canPublishTask() && canAccessDept(dept.id)) {
    var addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.innerHTML = '＋ 添加任务';
    addBtn.style.marginBottom = '16px';
    addBtn.onclick = function() { openTaskModal(); };
    container.appendChild(addBtn);
  }
  if (!tasks.length) {
    container.innerHTML += '<div class="empty-state"><div class="empty-icon">📭</div><p>该部门暂无任务</p></div>';
    return;
  }
  var grid = document.createElement('div');
  grid.className = 'card-grid';
  tasks.forEach(function(task) {
    grid.appendChild(createTaskCard(task));
  });
  container.appendChild(grid);
}

function renderDeptFiles(container, dept) {
  var subs = state.data.fileSubmissions.filter(function(f) { return f.department === dept.id; });
  subs.sort(function(a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });
  if (!subs.length) {
    container.innerHTML += '<div class="empty-state"><div class="empty-icon">📁</div><p>该部门暂无文件提交</p></div>';
    return;
  }
  var grid = document.createElement('div');
  grid.className = 'card-grid';
  subs.forEach(function(sub) {
    grid.appendChild(createFileCard(sub));
  });
  container.appendChild(grid);
}

function renderDeptSummary(container, dept) {
  var sums = state.data.summaryFiles.filter(function(f) { return f.department === dept.id; });
  sums.sort(function(a, b) { return new Date(b.uploadedAt) - new Date(a.uploadedAt); });
  if (!sums.length) {
    container.innerHTML += '<div class="empty-state"><div class="empty-icon">📋</div><p>该部门暂无汇总文件</p></div>';
    return;
  }
  sums.forEach(function(sum) {
    var item = document.createElement('div');
    item.className = 'summary-item';
    var uploader = state.data.users.find(function(u) { return u.id === sum.uploadedBy; });
    var task = state.data.tasks.find(function(t) { return t.id === sum.taskId; });
    item.innerHTML =
      '<div class="sum-info">' +
        '<div class="sum-name">' + escHtml(sum.fileName) + '</div>' +
        '<div class="sum-meta">上传人：' + escHtml(uploader ? uploader.name : '未知') + ' · 关联任务：' + escHtml(task ? task.title : '未知') + ' · ' + formatTime(sum.uploadedAt) + '</div>' +
      '</div>' +
      '<button class="btn btn-secondary btn-sm" onclick="downloadSummary(\'' + sum.id + '\')">下载</button>';
    container.appendChild(item);
  });
}

function renderDeptMembers(container, dept) {
  var minister = state.data.users.find(function(u) { return u.id === dept.ministerId; });
  var member = state.data.users.find(function(u) { return u.id === dept.memberId; });
  if (minister) {
    var mc = document.createElement('div');
    mc.className = 'dept-member-card';
    mc.innerHTML =
      '<div class="member-avatar" style="background:' + (dept.color || 'var(--grad)') + '">' + escHtml(minister.name.charAt(0)) + '</div>' +
      '<div class="member-info">' +
        '<div class="member-name">' + escHtml(minister.name) + '</div>' +
        '<div class="member-role">部长 · 用户名：' + escHtml(minister.username) + '</div>' +
      '</div>';
    container.appendChild(mc);
  }
  if (member) {
    var mc2 = document.createElement('div');
    mc2.className = 'dept-member-card';
    mc2.innerHTML =
      '<div class="member-avatar" style="background:' + (dept.color || 'var(--grad)') + ';opacity:.7">' + escHtml(member.name.charAt(0)) + '</div>' +
      '<div class="member-info">' +
        '<div class="member-name">' + escHtml(member.name) + '</div>' +
        '<div class="member-role">部员 · 用户名：' + escHtml(member.username) + '</div>' +
      '</div>';
    container.appendChild(mc2);
  }
  if (!minister && !member) {
    container.innerHTML += '<div class="empty-state"><div class="empty-icon">👥</div><p>该部门暂无成员</p></div>';
  }
}

function renderPreviousYear(area) {
  var prevYear = state.currentYear - 1;
  var header = document.createElement('div');
  header.className = 'content-header';
  var h2 = document.createElement('h2');
  h2.textContent = '去年任务 - ' + prevYear + '年';
  h2.innerHTML += '<span class="readonly-badge">只读</span>';
  header.appendChild(h2);
  area.appendChild(header);

  var tasks = state.data.tasks.filter(function(t) {
    return t.year === prevYear && t.isRegular === true;
  });

  if (!tasks.length) {
    area.innerHTML += '<div class="empty-state"><div class="empty-icon">📂</div><p>' + prevYear + '年暂无常态化任务记录</p></div>';
    return;
  }

  var grid = document.createElement('div');
  grid.className = 'card-grid animate-in';
  tasks.forEach(function(task) {
    var card = document.createElement('div');
    card.className = 'task-card';
    card.style.cursor = 'default';
    var deptColor = getDeptColor(task.department);
    var subCount = state.data.fileSubmissions.filter(function(f) { return f.taskId === task.id; }).length;
    var sumCount = state.data.summaryFiles.filter(function(f) { return f.taskId === task.id; }).length;
    var statusLabel = task.status === 'completed' ? '已完成' : '进行中';
    var statusClass = task.status === 'completed' ? 'completed' : 'active';
    var timeStr = '';
    if (task.month) timeStr += task.month + '月';
    if (task.day) timeStr += task.day + '日';
    if (task.timeSlot) timeStr += ' ' + task.timeSlot;
    card.innerHTML =
      '<div class="card-accent" style="background:' + deptColor + '"></div>' +
      '<div class="card-top">' +
        '<span class="card-name">' + escHtml(task.title) + '</span>' +
        '<span class="card-status ' + statusClass + '">' + statusLabel + '</span>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span class="tag ' + (CAT_TAG_CLASS[task.category] || 'tag-other') + '">' + escHtml(task.category) + '</span>' +
        '<span class="tag tag-other">' + escHtml(task.frequency) + '</span>' +
        '<span class="tag tag-dept" style="background:' + deptColor + '">' + escHtml(getDeptName(task.department)) + '</span>' +
        '<span class="tag tag-learn">常态化</span>' +
      '</div>' +
      (task.description ? '<div class="card-desc">' + escHtml(task.description) + '</div>' : '') +
      (timeStr ? '<div class="card-time">🕐 ' + escHtml(timeStr) + '</div>' : '') +
      '<div class="card-meta" style="margin-bottom:8px">' +
        '<span class="tag tag-learn">📎 提交 ' + subCount + '</span>' +
        '<span class="tag tag-daily">📋 汇总 ' + sumCount + '</span>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button class="btn btn-secondary btn-sm" onclick="viewPrevYearTaskFiles(\'' + task.id + '\')">查看文件</button>' +
      '</div>';
    grid.appendChild(card);
  });
  area.appendChild(grid);
}

function viewPrevYearTaskFiles(taskId) {
  var task = state.data.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  document.getElementById('taskDetailTitle').textContent = task.title + '（去年 · 只读）';
  var body = document.getElementById('taskDetailBody');
  body.innerHTML = '';

  var deptColor = getDeptColor(task.department);
  var info = document.createElement('div');
  info.className = 'task-detail-section';
  info.innerHTML =
    '<h4>基本信息</h4>' +
    '<p style="font-size:13px;line-height:1.8;color:var(--text2)">' +
      '<strong>所属部门：</strong><span style="color:' + deptColor + ';font-weight:600">' + escHtml(getDeptName(task.department)) + '</span><br>' +
      '<strong>类别：</strong>' + escHtml(task.category) + '<br>' +
      '<strong>频次：</strong>' + escHtml(task.frequency) + '<br>' +
      '<strong>指派给：</strong>' + escHtml(getTaskAssignedToLabel(task.assignedTo)) + '<br>' +
    '</p>';
  body.appendChild(info);

  var subs = state.data.fileSubmissions.filter(function(f) { return f.taskId === taskId; });
  if (state.currentUser.role === 'minister' || state.currentUser.role === 'member') {
    subs = subs.filter(function(f) { return f.department === state.currentUser.department; });
  }
  var subSection = document.createElement('div');
  subSection.className = 'task-detail-section';
  subSection.innerHTML = '<h4>文件提交 (' + subs.length + ')</h4>';
  if (!subs.length) {
    subSection.innerHTML += '<p style="font-size:13px;color:var(--text3)">暂无文件提交</p>';
  } else {
    subs.forEach(function(sub) {
      var item = document.createElement('div');
      item.className = 'submission-item';
      var statusHtml = '';
      if (sub.status === 'pending') statusHtml = '<span class="sub-status status-pending">待审核</span>';
      else if (sub.status === 'approved') statusHtml = '<span class="sub-status status-approved">已通过</span>';
      else statusHtml = '<span class="sub-status status-returned">已打回</span>';
      item.innerHTML =
        '<div class="sub-info">' +
          '<div class="sub-name">' + escHtml(sub.fileName) + '</div>' +
          '<div class="sub-meta">提交人：' + escHtml(sub.submittedByName) + ' · ' + formatTime(sub.submittedAt) + '</div>' +
        '</div>' +
        statusHtml +
        ' <button class="btn btn-secondary btn-sm" onclick="downloadSubmission(\'' + sub.id + '\')">下载</button>';
      subSection.appendChild(item);
    });
  }
  body.appendChild(subSection);

  var sums = state.data.summaryFiles.filter(function(f) { return f.taskId === taskId; });
  if (state.currentUser.role === 'minister' || state.currentUser.role === 'member') {
    sums = sums.filter(function(f) { return f.department === state.currentUser.department; });
  }
  var sumSection = document.createElement('div');
  sumSection.className = 'task-detail-section';
  sumSection.innerHTML = '<h4>汇总文件 (' + sums.length + ')</h4>';
  if (!sums.length) {
    sumSection.innerHTML += '<p style="font-size:13px;color:var(--text3)">暂无汇总文件</p>';
  } else {
    sums.forEach(function(sum) {
      var item = document.createElement('div');
      item.className = 'summary-item';
      var uploader = state.data.users.find(function(u) { return u.id === sum.uploadedBy; });
      item.innerHTML =
        '<div class="sum-info">' +
          '<div class="sum-name">' + escHtml(sum.fileName) + '</div>' +
          '<div class="sum-meta">上传人：' + escHtml(uploader ? uploader.name : '未知') + ' · ' + formatTime(sum.uploadedAt) + '</div>' +
        '</div>' +
        '<button class="btn btn-secondary btn-sm" onclick="downloadSummary(\'' + sum.id + '\')">下载</button>';
      sumSection.appendChild(item);
    });
  }
  body.appendChild(sumSection);

  document.getElementById('taskDetailOverlay').classList.add('active');
}

function renderPermissions(area) {
  if (!canManageUsers()) {
    area.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>无权限访问</p></div>';
    return;
  }
  var header = document.createElement('div');
  header.className = 'content-header';
  var h2 = document.createElement('h2');
  h2.textContent = '权限管理';
  header.appendChild(h2);
  var actions = document.createElement('div');
  actions.className = 'actions';
  var addUserBtn = document.createElement('button');
  addUserBtn.className = 'btn btn-primary btn-sm';
  addUserBtn.innerHTML = '＋ 添加用户';
  addUserBtn.onclick = function() { openUserModal(); };
  actions.appendChild(addUserBtn);
  var addDeptBtn = document.createElement('button');
  addDeptBtn.className = 'btn btn-secondary btn-sm';
  addDeptBtn.innerHTML = '🏢 添加部门';
  addDeptBtn.onclick = function() { openDeptModal(); };
  actions.appendChild(addDeptBtn);
  var permBtn = document.createElement('button');
  permBtn.className = 'btn btn-secondary btn-sm';
  permBtn.innerHTML = '📋 权限矩阵';
  permBtn.onclick = function() { openPermMatrix(); };
  actions.appendChild(permBtn);
  header.appendChild(actions);
  area.appendChild(header);

  var list = document.createElement('div');
  list.className = 'animate-in';
  state.data.users.forEach(function(u) {
    var item = document.createElement('div');
    item.className = 'user-item';
    var canDelete = u.id !== state.currentUser.id;
    var roleSelect = '<select onchange="changeUserRole(\'' + u.id + '\',this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px">';
    Object.keys(ROLE_MAP).forEach(function(key) {
      roleSelect += '<option value="' + key + '"' + (u.role === key ? ' selected' : '') + '>' + ROLE_MAP[key] + '</option>';
    });
    roleSelect += '</select>';
    var deptSelect = '<select onchange="changeUserDept(\'' + u.id + '\',this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-left:4px">';
    deptSelect += '<option value="">无部门</option>';
    state.data.departments.forEach(function(d) {
      deptSelect += '<option value="' + d.id + '"' + (u.department === d.id ? ' selected' : '') + '>' + escHtml(d.name) + '</option>';
    });
    deptSelect += '</select>';
    var avatarBg = u.department ? getDeptColor(u.department) : 'var(--grad)';
    item.innerHTML =
      '<div class="user-avatar" style="background:' + avatarBg + '">' + escHtml(u.name.charAt(0)) + '</div>' +
      '<div class="user-detail">' +
        '<div class="user-name">' + escHtml(u.name) + ' (' + escHtml(u.username) + ')</div>' +
        '<div class="user-role">' + roleSelect + deptSelect + '</div>' +
      '</div>' +
      (canDelete ? '<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + u.id + '\')">删除</button>' : '');
    list.appendChild(item);
  });
  area.appendChild(list);

  var deptSection = document.createElement('div');
  deptSection.className = 'dept-manage-section animate-in';
  deptSection.innerHTML = '<h4>部门管理</h4>';
  state.data.departments.forEach(function(dept) {
    var minister = state.data.users.find(function(u) { return u.id === dept.ministerId; });
    var member = state.data.users.find(function(u) { return u.id === dept.memberId; });
    var item = document.createElement('div');
    item.className = 'dept-item';
    item.innerHTML =
      '<div class="dept-color-dot" style="background:' + (dept.color || '#999') + '"></div>' +
      '<div class="dept-item-info">' +
        '<div class="dept-item-name">' + escHtml(dept.name) + '</div>' +
        '<div class="dept-item-accounts">部长：' + escHtml(minister ? minister.name + ' (' + minister.username + ')' : '未设置') + ' · 部员：' + escHtml(member ? member.name + ' (' + member.username + ')' : '未设置') + '</div>' +
      '</div>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteDepartment(\'' + dept.id + '\')">删除</button>';
    deptSection.appendChild(item);
  });
  area.appendChild(deptSection);
}

function changeUserRole(userId, newRole) {
  API.put('/api/users/' + userId + '/role', { role: newRole }).then(function() {
    loadData().then(function() {
      renderContent();
      showToast('用户角色已更新', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '更新失败', 'error');
  });
}

function changeUserDept(userId, newDept) {
  API.put('/api/users/' + userId + '/department', { department_id: newDept || null }).then(function() {
    loadData().then(function() {
      renderContent();
      showToast('用户部门已更新', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '更新失败', 'error');
  });
}

function openPermMatrix() {
  var body = document.getElementById('permModalBody');
  var perms = [
    ['发布任务', true, true, true, false, false],
    ['删除任务', true, true, false, false, false],
    ['提交文件', false, false, false, false, true],
    ['查看/下载所有部门文件', true, true, false, false, false],
    ['查看/下载本部门文件', false, false, true, true, false],
    ['打回文件（所有部门）', true, true, false, false, false],
    ['打回文件（本部门）', false, false, true, true, false],
    ['上传汇总文件', true, true, true, false, false],
    ['管理用户与部门', true, false, false, false, false],
    ['访问部门空间（所有）', true, true, false, false, false],
    ['访问部门空间（本部门）', false, false, true, true, false]
  ];
  var html = '<table class="perm-matrix">' +
    '<tr><th>权限</th><th>团委书记</th><th>副书记</th><th>部长</th><th>部员</th><th>团支书</th></tr>';
  perms.forEach(function(row) {
    html += '<tr><td>' + row[0] + '</td>';
    for (var i = 1; i < row.length; i++) {
      html += '<td class="' + (row[i] ? 'perm-yes' : 'perm-no') + '">' + (row[i] ? '✓' : '✗') + '</td>';
    }
    html += '</tr>';
  });
  html += '</table>';
  body.innerHTML = html;
  document.getElementById('permModalOverlay').classList.add('active');
}

function closePermModal() {
  document.getElementById('permModalOverlay').classList.remove('active');
}

function renderNotifications(area) {
  var header = document.createElement('div');
  header.className = 'content-header';
  var h2 = document.createElement('h2');
  h2.textContent = '通知中心';
  header.appendChild(h2);
  var actions = document.createElement('div');
  actions.className = 'actions';
  var markAllBtn = document.createElement('button');
  markAllBtn.className = 'btn btn-secondary btn-sm';
  markAllBtn.innerHTML = '全部标为已读';
  markAllBtn.onclick = function() {
    var userId = state.currentUser.id;
    var unreadNotifs = state.data.notifications.filter(function(n) {
      return !n.read && (n.targetUser === 'all' || n.targetUser === userId);
    });
    var promises = unreadNotifs.map(function(n) {
      return API.put('/api/notifications/' + n.id + '/read', {});
    });
    Promise.all(promises).then(function() {
      loadData().then(function() {
        updateNotifBadge();
        renderContent();
        showToast('已全部标为已读', 'success');
      });
    }).catch(function(err) {
      showToast(err.error || '操作失败', 'error');
    });
  };
  actions.appendChild(markAllBtn);
  header.appendChild(actions);
  area.appendChild(header);

  var userId = state.currentUser.id;
  var notifs = state.data.notifications.filter(function(n) {
    return n.targetUser === 'all' || n.targetUser === userId;
  }).sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

  var list = document.createElement('div');
  list.className = 'animate-in';
  if (!notifs.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><p>暂无通知</p></div>';
  } else {
    var ul = document.createElement('ul');
    ul.className = 'notif-list';
    notifs.forEach(function(n) {
      var li = document.createElement('li');
      li.className = 'notif-item' + (n.read ? ' read' : ' unread');
      var typeIcon = '📢';
      if (n.type === 'task') typeIcon = '📋';
      else if (n.type === 'file') typeIcon = '📁';
      else if (n.type === 'system') typeIcon = '🔔';
      li.innerHTML =
        '<span class="notif-type-icon">' + typeIcon + '</span>' +
        '<div class="notif-content">' +
          '<div class="notif-title">' + escHtml(n.title) + '</div>' +
          '<div class="notif-msg">' + escHtml(n.message) + '</div>' +
          '<div class="notif-time">' + formatTime(n.createdAt) + '</div>' +
        '</div>' +
        '<span class="notif-dot"></span>';
      li.onclick = function() {
        if (!n.read) {
          API.put('/api/notifications/' + n.id + '/read', {}).then(function() {
            n.read = true;
            updateNotifBadge();
            li.className = 'notif-item read';
            li.querySelector('.notif-dot').style.background = 'var(--border)';
          }).catch(function() {});
        }
      };
      ul.appendChild(li);
    });
    list.appendChild(ul);
  }
  area.appendChild(list);
}

function openUserModal() {
  renderUserList();
  initNewUserDeptOptions();
  document.getElementById('userModalOverlay').classList.add('active');
}

function closeUserModal() {
  document.getElementById('userModalOverlay').classList.remove('active');
}

function initNewUserDeptOptions() {
  var sel = document.getElementById('newUserDepartment');
  sel.innerHTML = '<option value="">无</option>';
  state.data.departments.forEach(function(d) {
    sel.innerHTML += '<option value="' + d.id + '">' + escHtml(d.name) + '</option>';
  });
}

function renderUserList() {
  var list = document.getElementById('userList');
  list.innerHTML = '';
  state.data.users.forEach(function(u) {
    var li = document.createElement('li');
    li.className = 'user-item';
    var canDelete = state.currentUser ? u.id !== state.currentUser.id : true;
    var roleChangeHtml = '';
    if (canManageUsers()) {
      roleChangeHtml = '<select onchange="changeUserRole(\'' + u.id + '\',this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px">';
      Object.keys(ROLE_MAP).forEach(function(key) {
        roleChangeHtml += '<option value="' + key + '"' + (u.role === key ? ' selected' : '') + '>' + ROLE_MAP[key] + '</option>';
      });
      roleChangeHtml += '</select>';
    } else {
      roleChangeHtml = '<span style="font-size:12px;color:var(--text3)">' + escHtml(ROLE_MAP[u.role] || u.role) + '</span>';
    }
    var deptLabel = u.department ? ' · ' + escHtml(getDeptName(u.department)) : '';
    li.innerHTML =
      '<div class="user-avatar">' + escHtml(u.name.charAt(0)) + '</div>' +
      '<div class="user-detail">' +
        '<div class="user-name">' + escHtml(u.name) + ' (' + escHtml(u.username) + ')' + deptLabel + '</div>' +
        '<div class="user-role">' + roleChangeHtml + '</div>' +
      '</div>' +
      (canDelete && canManageUsers() ? '<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + u.id + '\')">删除</button>' : '');
    list.appendChild(li);
  });
}

function addUser() {
  var name = document.getElementById('newUserName').value.trim();
  var username = document.getElementById('newUserUsername').value.trim();
  var password = document.getElementById('newUserPassword').value.trim();
  var role = document.getElementById('newUserRole').value;
  var department = document.getElementById('newUserDepartment').value || null;
  if (!name || !username || !password) {
    showToast('请填写完整信息', 'error');
    return;
  }
  API.post('/api/users', {
    name: name,
    username: username,
    password: password,
    role: role,
    department_id: department
  }).then(function() {
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserPassword').value = '';
    loadData().then(function() {
      renderUserList();
      if (state.currentNav === 'permissions') renderContent();
      showToast('用户已添加', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '添加失败', 'error');
  });
}

function deleteUser(id) {
  if (state.currentUser && state.currentUser.id === id) {
    showToast('不能删除当前登录用户', 'error');
    return;
  }
  if (!confirm('确定要删除此用户吗？')) return;
  API.del('/api/users/' + id).then(function() {
    loadData().then(function() {
      renderUserList();
      if (state.currentNav === 'permissions') renderContent();
      showToast('用户已删除', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '删除失败', 'error');
  });
}

function openDeptModal() {
  document.getElementById('newDeptName').value = '';
  document.getElementById('newDeptColor').value = '#722ed1';
  var minSel = document.getElementById('newDeptMinister');
  minSel.innerHTML = '<option value="">自动创建</option>';
  state.data.users.forEach(function(u) {
    if (u.role === 'minister' || u.role === 'member') {
      var opt1 = document.createElement('option');
      opt1.value = u.id;
      opt1.textContent = u.name + ' (' + u.username + ')';
      minSel.appendChild(opt1);
    }
  });
  document.getElementById('deptModalOverlay').classList.add('active');
}

function closeDeptModal() {
  document.getElementById('deptModalOverlay').classList.remove('active');
}

function addDepartment() {
  var name = document.getElementById('newDeptName').value.trim();
  if (!name) { showToast('请输入部门名称', 'error'); return; }
  var color = document.getElementById('newDeptColor').value;
  var ministerId = document.getElementById('newDeptMinister').value;

  API.post('/api/departments', {
    name: name,
    color: color,
    minister_id: ministerId || null
  }).then(function() {
    closeDeptModal();
    loadData().then(function() {
      if (state.currentNav === 'permissions') renderContent();
      showToast('部门已添加', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '添加失败', 'error');
  });
}

function deleteDepartment(deptId) {
  if (!confirm('确定要删除此部门吗？')) return;
  API.del('/api/departments/' + deptId).then(function() {
    loadData().then(function() {
      renderContent();
      showToast('部门已删除', 'success');
    });
  }).catch(function(err) {
    showToast(err.error || '删除失败', 'error');
  });
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var loginPage = document.getElementById('loginPage');
    if (loginPage.style.display !== 'none') {
      handleLogin();
    }
  }
  if (e.key === 'Escape') {
    closeTaskModal();
    closeTaskDetail();
    closeFileSubmit();
    closeSummaryUpload();
    closeReturnModal();
    closeUserModal();
    closePermModal();
    closeDeptModal();
  }
});

document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});

checkAuth().then(function(isAuthed) {
  if (isAuthed) {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').style.display = '';
    renderNavbar();
    renderSidebar();
    loadData().then(function() {
      renderContent();
      updateNotifBadge();
    });
  } else {
    showLogin();
  }
});
