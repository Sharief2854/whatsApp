const socket = io();

let isConnected = false;
let isProcessing = false;
let allGroups = [];

// DOM Elements
const connectionStatusBadge = document.getElementById('connectionStatusBadge');
const qrImage = document.getElementById('qrImage');
const qrSpinner = document.getElementById('qrSpinner');
const qrStatusText = document.getElementById('qrStatusText');
const logoutBtn = document.getElementById('logoutBtn');
const logBox = document.getElementById('logBox');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');

// Tab 1 Elements: Add Members
const groupSelect = document.getElementById('groupSelect');
const groupSearchInput = document.getElementById('groupSearchInput');
const groupCountText = document.getElementById('groupCountText');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

// Tab 2 Elements: Bulk Message
const targetRadioNumbers = document.getElementById('targetRadioNumbers');
const targetRadioGroups = document.getElementById('targetRadioGroups');
const msgNumbersSection = document.getElementById('msgNumbersSection');
const msgGroupsSection = document.getElementById('msgGroupsSection');
const msgGroupSearch = document.getElementById('msgGroupSearch');
const groupChecklist = document.getElementById('groupChecklist');
const selectedGroupsCount = document.getElementById('selectedGroupsCount');
const messageBody = document.getElementById('messageBody');
const sendBtn = document.getElementById('sendBtn');
const stopSendBtn = document.getElementById('stopSendBtn');

// Logger helper
function appendLog(message, type = 'info') {
  const item = document.createElement('div');
  item.className = 'log-item';
  const timestamp = new Date().toLocaleTimeString();

  if (type === 'error') {
    item.className += ' text-danger';
  } else if (type === 'success') {
    item.className += ' text-success';
  } else if (type === 'warning') {
    item.className += ' text-warning';
  } else {
    item.className += ' text-info';
  }

  item.textContent = `[${timestamp}] ${message}`;
  logBox.appendChild(item);
  logBox.scrollTop = logBox.scrollHeight;
}

function clearLogs() {
  logBox.innerHTML = '';
}

// Socket Events
socket.on('connect', async () => {
  appendLog('Connected to backend server.', 'info');
  // Check initial WhatsApp connection status
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      setConnectedState();
    } else if (data.hasQr && data.qr) {
      setQrState(data.qr);
    }
  } catch (e) {
    console.error('Failed to fetch initial status:', e);
  }
});

function setConnectedState() {
  isConnected = true;
  qrImage.style.display = 'none';
  qrSpinner.style.display = 'none';
  qrStatusText.innerHTML = '<span class="text-success fw-bold"><i class="bi bi-check-circle-fill"></i> Connected!</span>';
  connectionStatusBadge.innerHTML = '<span class="badge bg-success px-3 py-2"><i class="bi bi-check-circle"></i> Connected</span>';
  logoutBtn.disabled = false;
  disableActions(false);
  fetchGroups();
}

function setQrState(url) {
  qrImage.src = url;
  qrImage.style.display = 'block';
  qrSpinner.style.display = 'none';
  qrStatusText.textContent = 'Scan QR code with WhatsApp';
  connectionStatusBadge.innerHTML = '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-qr-code"></i> Scan QR Code</span>';
  logoutBtn.disabled = true;
  disableActions(true);
}

socket.on('qr', (url) => {
  qrImage.src = url;
  qrImage.style.display = 'block';
  qrSpinner.style.display = 'none';
  qrStatusText.textContent = 'Scan QR code with WhatsApp';
  connectionStatusBadge.innerHTML = '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-qr-code"></i> Scan QR Code</span>';
  logoutBtn.disabled = true;
  disableActions(true);
});

socket.on('ready', () => {
  isConnected = true;
  qrImage.style.display = 'none';
  qrSpinner.style.display = 'none';
  qrStatusText.innerHTML = '<span class="text-success fw-bold"><i class="bi bi-check-circle-fill"></i> Connected!</span>';
  connectionStatusBadge.innerHTML = '<span class="badge bg-success px-3 py-2"><i class="bi bi-check-circle"></i> Connected</span>';
  logoutBtn.disabled = false;
  disableActions(false);
  appendLog('WhatsApp client ready!', 'success');
  fetchGroups();
});

socket.on('disconnected', (reason) => {
  isConnected = false;
  connectionStatusBadge.innerHTML = '<span class="badge bg-danger px-3 py-2"><i class="bi bi-exclamation-triangle"></i> Disconnected</span>';
  qrStatusText.textContent = 'Disconnected. Scan QR code to connect.';
  logoutBtn.disabled = true;
  disableActions(true);
  appendLog(`WhatsApp disconnected: ${reason}`, 'error');
});

socket.on('log', (data) => {
  appendLog(data.message, data.type || 'info');
});

socket.on('progress', (data) => {
  const current = data.current;
  const total = data.total;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  progressText.textContent = `${current} / ${total}`;
  progressPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
});

socket.on('completed', () => {
  isProcessing = false;
  startBtn.disabled = !isConnected;
  sendBtn.disabled = !isConnected;
  stopBtn.disabled = true;
  stopSendBtn.disabled = true;
  appendLog('Task completed!', 'success');
});

function disableActions(disable) {
  groupSearchInput.disabled = disable;
  groupSelect.disabled = disable;
  startBtn.disabled = disable;
  sendBtn.disabled = disable;
}

// Fetch WhatsApp Groups
async function fetchGroups() {
  appendLog('Fetching WhatsApp groups...', 'info');
  try {
    const res = await fetch('/api/groups');
    const data = await res.json();
    if (data.success) {
      allGroups = data.groups;
      filterGroups();
      renderGroupChecklist(allGroups);
      appendLog(`Loaded ${allGroups.length} groups.`, 'success');
    } else {
      appendLog(`Error fetching groups: ${data.error}`, 'error');
    }
  } catch (err) {
    appendLog(`Failed to communicate with server: ${err.message}`, 'error');
  }
}

// --- TAB 1: ADD MEMBERS LOGIC ---
function renderGroupOptions(groups) {
  const currentVal = groupSelect.value;
  groupSelect.innerHTML = '<option value="">-- Choose Target Group --</option>';
  groups.forEach(group => {
    const opt = document.createElement('option');
    opt.value = group.id;
    opt.textContent = `${group.name} (${group.participantsCount || 0} members)`;
    if (group.id === currentVal) opt.selected = true;
    groupSelect.appendChild(opt);
  });
  groupCountText.textContent = `Showing ${groups.length} of ${allGroups.length} groups`;
}

function filterGroups() {
  const query = (groupSearchInput.value || '').toLowerCase().trim();
  if (!query) {
    renderGroupOptions(allGroups);
    return;
  }
  const filtered = allGroups.filter(g => (g.name || '').toLowerCase().includes(query));
  renderGroupOptions(filtered);
}

async function extractNumbers(sourceType, textId, fileId, defaultCodeId) {
  const defaultCountryCode = document.getElementById(defaultCodeId).value.trim();
  let rawNumbers = [];

  if (sourceType === 'paste') {
    const text = document.getElementById(textId).value;
    rawNumbers = text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  } else {
    const fileInput = document.getElementById(fileId);
    if (!fileInput.files.length) {
      alert('Please upload an Excel or CSV file.');
      return [];
    }
    const file = fileInput.files[0];
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

    rows.forEach(row => {
      if (Array.isArray(row)) {
        row.forEach(cell => {
          if (cell !== undefined && cell !== null) {
            const cellStr = cell.toString().trim();
            if (/\d{7,}/.test(cellStr)) rawNumbers.push(cellStr);
          }
        });
      }
    });
  }

  const cleaned = [];
  rawNumbers.forEach(n => {
    let digits = n.replace(/\D/g, '');
    if (!digits) return;
    if (digits.length === 10 && defaultCountryCode) digits = defaultCountryCode + digits;
    if (digits.length >= 10 && !cleaned.includes(digits)) cleaned.push(digits);
  });

  return cleaned;
}

async function startBulkAdd() {
  const groupId = groupSelect.value;
  if (!groupId) return alert('Please select a target WhatsApp group.');

  const isPasteActive = document.querySelector('#addInputTabs .nav-link.active').getAttribute('data-bs-target') === '#add-paste-pill';
  const numbers = await extractNumbers(isPasteActive ? 'paste' : 'file', 'numbersTextArea', 'fileInput', 'defaultCountryCode');

  if (!numbers.length) return alert('No valid phone numbers found.');

  const delaySeconds = parseInt(document.getElementById('delaySeconds').value) || 10;

  isProcessing = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;

  appendLog(`Queued ${numbers.length} numbers to add with ${delaySeconds}s delay.`, 'info');

  try {
    const res = await fetch('/api/start-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, numbers, delaySeconds })
    });
    const result = await res.json();
    if (!result.success) {
      appendLog(`Failed to start: ${result.error}`, 'error');
      isProcessing = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  } catch (err) {
    appendLog(`Request error: ${err.message}`, 'error');
    isProcessing = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

async function stopBulkAdd() {
  try {
    await fetch('/api/stop-add', { method: 'POST' });
    appendLog('Stopping add process requested...', 'warning');
    stopBtn.disabled = true;
  } catch (err) {
    appendLog(`Stop error: ${err.message}`, 'error');
  }
}

// --- TAB 2: BULK MESSAGING LOGIC ---
function toggleMsgTargetType() {
  if (targetRadioNumbers.checked) {
    msgNumbersSection.style.display = 'block';
    msgGroupsSection.style.display = 'none';
  } else {
    msgNumbersSection.style.display = 'none';
    msgGroupsSection.style.display = 'block';
    renderGroupChecklist(allGroups);
  }
}

function renderGroupChecklist(groups) {
  if (!groups.length) {
    groupChecklist.innerHTML = '<div class="text-muted small">No groups found</div>';
    return;
  }

  let html = '';
  groups.forEach(g => {
    html += `
      <div class="form-check py-1">
        <input class="form-check-input group-checkbox" type="checkbox" value="${g.id}" data-name="${g.name}" id="chk_${g.id}" onchange="updateSelectedGroupsCount()">
        <label class="form-check-label small" for="chk_${g.id}">
          ${g.name} <span class="text-muted">(${g.participantsCount || 0} members)</span>
        </label>
      </div>
    `;
  });
  groupChecklist.innerHTML = html;
  updateSelectedGroupsCount();
}

function filterMsgGroupChecklist() {
  const query = (msgGroupSearch.value || '').toLowerCase().trim();
  const filtered = allGroups.filter(g => (g.name || '').toLowerCase().includes(query));
  renderGroupChecklist(filtered);
}

function selectAllMsgGroups(check) {
  document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = check);
  updateSelectedGroupsCount();
}

function updateSelectedGroupsCount() {
  const count = document.querySelectorAll('.group-checkbox:checked').length;
  selectedGroupsCount.textContent = `${count} groups selected`;
}

async function startBulkSend() {
  const message = messageBody.value.trim();
  if (!message) return alert('Please enter message content.');

  let targets = [];
  const targetType = targetRadioGroups.checked ? 'groups' : 'numbers';

  if (targetType === 'groups') {
    const checked = document.querySelectorAll('.group-checkbox:checked');
    if (!checked.length) return alert('Please select at least one group to message.');
    checked.forEach(cb => {
      targets.push({ id: cb.value, name: cb.getAttribute('data-name') });
    });
  } else {
    const isPasteActive = document.querySelector('#pane-msg .nav-pills .nav-link.active').getAttribute('data-bs-target') === '#msg-paste-pill';
    targets = await extractNumbers(isPasteActive ? 'paste' : 'file', 'msgNumbersTextArea', 'msgFileInput', 'msgDefaultCountryCode');
    if (!targets.length) return alert('Please provide phone numbers to send to.');
  }

  const delaySeconds = parseInt(document.getElementById('msgDelaySeconds').value) || 6;

  isProcessing = true;
  sendBtn.disabled = true;
  stopSendBtn.disabled = false;

  appendLog(`Sending bulk message to ${targets.length} ${targetType} with ${delaySeconds}s delay...`, 'info');

  try {
    const res = await fetch('/api/send-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType, targets, message, delaySeconds })
    });
    const result = await res.json();
    if (!result.success) {
      appendLog(`Failed to start: ${result.error}`, 'error');
      isProcessing = false;
      sendBtn.disabled = false;
      stopSendBtn.disabled = true;
    }
  } catch (err) {
    appendLog(`Request error: ${err.message}`, 'error');
    isProcessing = false;
    sendBtn.disabled = false;
    stopSendBtn.disabled = true;
  }
}

async function stopBulkSend() {
  try {
    await fetch('/api/stop-send', { method: 'POST' });
    appendLog('Stopping bulk send requested...', 'warning');
    stopSendBtn.disabled = true;
  } catch (err) {
    appendLog(`Stop error: ${err.message}`, 'error');
  }
}

// Session Helpers
async function restartSession() {
  if (confirm('Reconnect WhatsApp session?')) {
    appendLog('Reconnecting session...', 'warning');
    await fetch('/api/restart', { method: 'POST' });
  }
}

async function logoutSession() {
  if (confirm('Are you sure you want to logout?')) {
    appendLog('Logging out from WhatsApp...', 'warning');
    logoutBtn.disabled = true;
    try {
      const res = await fetch('/api/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        appendLog('Logged out. Ready for new QR scan.', 'info');
      } else {
        appendLog(`Logout error: ${data.error}`, 'error');
        logoutBtn.disabled = false;
      }
    } catch (err) {
      appendLog(`Logout request failed: ${err.message}`, 'error');
      logoutBtn.disabled = false;
    }
  }
}
