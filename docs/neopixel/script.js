// script.js
const SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';

// DOM
const btnConnect = document.getElementById('connect');
const statusEl   = document.getElementById('status-message');

btnConnect.addEventListener('click', async () => {
  try {
    // Solicita el dispositivo BLE filtrando por nombre
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'ESP32S3' }],
      optionalServices: [ SERVICE_UUID ]
    });

    // Intenta conectar al GATT Server
    const server = await device.gatt.connect();
    statusEl.textContent = `Conectado a ${device.name}`;

  } catch (err) {
    console.error('Falló conexión:', err);
    statusEl.textContent = `❌ Error: ${err.message || err}`;
  }
});
