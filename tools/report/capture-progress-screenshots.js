const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = process.cwd();
const screenshotDir = path.join(root, '汇报材料', 'screenshots');
const baseUrl = 'http://127.0.0.1:3000';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const demoTaskTitle = '2026年6月团支部工作材料提交（汇报演示）';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function waitForServer(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await canConnect(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function startServerIfNeeded() {
  if (await canConnect(3000)) return null;
  const nodePath = path.join(root, 'tools', 'nodejs', 'node.exe');
  const proc = spawn(nodePath, ['backend/server.js'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  proc.stdout.on('data', (chunk) => process.stdout.write(chunk));
  proc.stderr.on('data', (chunk) => process.stderr.write(chunk));
  const ready = await waitForServer(3000, 15000);
  if (!ready) throw new Error('本地服务启动超时');
  return proc;
}

async function login(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#loginUsername', { timeout: 10000 });
  await page.screenshot({ path: path.join(screenshotDir, '01-login.png'), fullPage: true });
  await page.fill('#loginUsername', 'secretary');
  await page.fill('#loginPassword', '123456');
  await page.click('.login-btn');
  await page.waitForFunction(() => window.state && state.currentUser && state.data && state.data.tasks, null, { timeout: 15000 });
  await page.evaluate(() => {
    state.currentYear = 2026;
    state.currentMonth = 6;
    state.currentNav = 'tasks';
    state.fileFilter = 'all';
    state.searchQuery = '';
    renderSidebar();
    renderContent();
  });
  await page.waitForFunction((title) => document.body.innerText.includes(title), demoTaskTitle, { timeout: 10000 });
}

async function closeAllOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay.active').forEach((el) => el.classList.remove('active'));
  });
  await page.waitForTimeout(300);
}

async function main() {
  ensureDir(screenshotDir);
  const server = await startServerIfNeeded();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: edgePath,
      args: ['--no-sandbox']
    });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });

    await login(page);
    await page.waitForSelector('.task-card', { timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(screenshotDir, '02-task-dashboard-clean.png'), fullPage: true });

    await page.evaluate(() => {
      openTaskModal();
      document.getElementById('taskTitle').value = '新建任务时可按标签或人员派发';
      document.getElementById('taskIsRegular').value = 'false';
      syncTaskFrequencyVisibility();
      Array.from(document.querySelectorAll('#assignmentPanel input[type="checkbox"]')).forEach((input) => {
        input.checked = false;
      });
      ['committee:secretariat', 'committee:leaders:dept:dept1', 'committee:dept:dept1', 'branch:all'].forEach((tag) => {
        const input = document.querySelector(`#assignmentPanel input[data-tag="${tag}"]`);
        if (input) input.checked = true;
      });
      updateAssignmentSummary();
    });
    await page.waitForSelector('#taskModalOverlay.active #assignmentPanel');
    await page.locator('#taskModalOverlay .modal').screenshot({ path: path.join(screenshotDir, '03-assignment-modal.png') });

    const taskId = await page.evaluate((title) => {
      const task = state.data.tasks.find((item) => item.title === title);
      return task ? task.id : null;
    }, demoTaskTitle);
    if (!taskId) throw new Error('未找到汇报演示任务');

    await closeAllOverlays(page);
    await page.evaluate((id) => {
      openTaskDetail(id);
    }, taskId);
    await page.waitForSelector('#taskDetailOverlay.active .completion-card');
    await page.locator('#taskDetailOverlay .modal').screenshot({ path: path.join(screenshotDir, '04-task-detail-completion.png') });

    await closeAllOverlays(page);
    await page.evaluate(() => switchNav('files'));
    await page.waitForSelector('.file-card', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotDir, '05-file-review-clean.png'), fullPage: true });

    await closeAllOverlays(page);
    await page.evaluate(() => switchNav('permissions'));
    await page.waitForSelector('.user-item', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotDir, '06-permission-users-clean.png'), fullPage: true });

    console.log('screenshots=' + screenshotDir);
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
