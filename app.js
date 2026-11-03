export const VERSION = '0.1.0';

document.getElementById('version').textContent = VERSION;

const net = document.getElementById('net');
function updateNet() {
  const on = navigator.onLine;
  net.textContent = on ? 'Online' : 'Bez signálu';
  net.className = 'pill ' + (on ? 'online' : 'offline');
}
addEventListener('online', updateNet);
addEventListener('offline', updateNet);
updateNet();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(async () => {
    await navigator.serviceWorker.ready;
    document.getElementById('offline-state').textContent = 'připraveno i bez signálu';
  }).catch(() => {
    document.getElementById('offline-state').textContent = 'offline režim nejde zapnout';
  });
}
