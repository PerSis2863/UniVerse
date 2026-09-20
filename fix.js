const fs = require('fs');

// Fix student.js download buttons
let studentJs = fs.readFileSync('public/js/student.js', 'utf8');
studentJs = studentJs.replace(/showToast\('File','\$\{f\} download would start in a real app','info'\)/g, "window.open('/assets/dummy.pdf', '_blank')");
studentJs = studentJs.replace(/showToast\('Download','Receipt PDF download would start in a real app','info'\)/g, "window.open('/assets/dummy.pdf', '_blank')");
studentJs = studentJs.replace(/showToast\('Downloading', '\$\{d\.title\} is downloading\.\.\.', 'success'\)/g, "window.open('/assets/dummy.pdf', '_blank')");
fs.writeFileSync('public/js/student.js', studentJs);

// Fix admin.html and teacher.html missing notification panel
const notifHtml = `
  <!-- NOTIFICATION PANEL -->
  <div class="notif-overlay" id="notifOverlay" onclick="closeNotifPanel()"></div>
  <div class="notif-panel" id="notifPanel">
    <div class="notif-panel-hdr">
      <h3>Notifications</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn-text" onclick="markAllRead()">Mark all read</button>
        <button class="notif-close" onclick="closeNotifPanel()">✕</button>
      </div>
    </div>
    <div class="notif-list" id="notifList"></div>
  </div>
`;

const notifJs = `
function toggleNotifPanel() {
  document.getElementById('notifPanel').classList.toggle('open');
  document.getElementById('notifOverlay').classList.toggle('open');
}
function closeNotifPanel() {
  document.getElementById('notifPanel').classList.remove('open');
  document.getElementById('notifOverlay').classList.remove('open');
}
function markRead(id) {
  closeNotifPanel();
  showToast('Marked as read', 'Notification marked as read', 'success');
}
function markAllRead() {
  closeNotifPanel();
  showToast('All read', 'All notifications marked as read', 'success');
}
`;

['admin.html', 'teacher.html'].forEach(file => {
  let content = fs.readFileSync('public/' + file, 'utf8');
  
  // Replace button
  content = content.replace(
    /<div class="notif-btn">🔔<span class="notif-badge" id="notifBadge">(.*?)<\/span><\/div>/g,
    '<button class="notif-btn" id="notifBtn" onclick="toggleNotifPanel()">🔔<span class="notif-badge" id="notifBadge">$1</span></button>'
  );
  
  // Inject HTML panel
  if (!content.includes('id="notifPanel"')) {
    content = content.replace('<body>', '<body>\n' + notifHtml);
  }
  
  // Inject JS
  if (!content.includes('toggleNotifPanel')) {
    content = content.replace('</script>', notifJs + '</script>');
  }
  
  fs.writeFileSync('public/' + file, content);
});

console.log("Done");
