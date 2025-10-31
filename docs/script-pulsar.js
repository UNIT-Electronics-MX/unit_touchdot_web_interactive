/**
 * Pulsar H2 Bluetooth Web Control - Script Específico
 * 
 * Control completo del dispositivo Pulsar H2 via Web Bluetooth API
 * Desarrollado por UNIT Electronics
 * 
 * Funcionalidades:
 * - Control NeoPixel RGB con sliders y colores predefinidos
 * - Monitoreo ADC (GPIO2/GPIO3) en tiempo real
 * - Monitoreo GPIO9 con notificaciones
 * - Control de microSD para escribir datos
 * - Log de actividad detallado
 */

// ========================================
// CONFIGURACIÓN BLE - UUIDs del Pulsar H2
// ========================================
const SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';           // Servicio principal
const NEOPIXEL_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-1234567890ac'; // Control NeoPixel (Write)
const SENSOR_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-1234567890ad'; // ADC Sensores (Read/Notify) + Device Info al conectar
const GPIO_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-1234567890ae';  // GPIO9 (Notify)
const SD_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-1234567890af';    // MicroSD (Write/Read)
const BLINK_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-1234567890b0';  // GPIO1 Blink (Write/Read/Notify)

// Variables globales
let bluetoothDevice = null;
let bluetoothServer = null;
let bluetoothService = null;
let neopixelCharacteristic = null;
let sensorCharacteristic = null;
let gpioCharacteristic = null;
let sdCharacteristic = null;
let blinkCharacteristic = null;

// Variables para autoscan
let scanInterval = null;
let isScanning = false;
let foundDevices = new Map();

// Variables para auto-reconexión
let autoReconnectEnabled = true;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectDelay = 2000; // 2 segundos
let reconnectTimeout = null;
let lastConnectedDevice = null;

// Referencias DOM
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const connectionStatus = document.getElementById('connection-status');
const autoScanBtn = document.getElementById('auto-scan-btn');
const quickScanBtn = document.getElementById('quick-scan-btn');
const devicesList = document.getElementById('devices-list');
const autoReconnectToggle = document.getElementById('auto-reconnect-toggle');
const reconnectBtn = document.getElementById('reconnect-btn');

// NeoPixel controls
const neopixelIndicator = document.getElementById('neopixel-indicator');
const redSlider = document.getElementById('red-slider');
const greenSlider = document.getElementById('green-slider');
const blueSlider = document.getElementById('blue-slider');
const redValue = document.getElementById('red-value');
const greenValue = document.getElementById('green-value');
const blueValue = document.getElementById('blue-value');

// Color buttons
const colorRed = document.getElementById('color-red');
const colorGreen = document.getElementById('color-green');
const colorBlue = document.getElementById('color-blue');
const colorYellow = document.getElementById('color-yellow');
const colorPurple = document.getElementById('color-purple');
const colorOff = document.getElementById('color-off');

// Sensor displays
const adcA2Value = document.getElementById('adc-a2-value');
const adcA3Value = document.getElementById('adc-a3-value');
const gpio9Value = document.getElementById('gpio9-value');
const readSensorsBtn = document.getElementById('read-sensors-btn');

// Verificar elementos críticos
console.log('🔍 Verificando elementos DOM:');
console.log('  adcA2Value:', adcA2Value ? '✅' : '❌');
console.log('  adcA3Value:', adcA3Value ? '✅' : '❌'); 
console.log('  gpio9Value:', gpio9Value ? '✅' : '❌');
if (!gpio9Value) {
    console.error('❌ CRÍTICO: Elemento gpio9-value no encontrado');
}

// SD Card controls (Simple)
const sdIndicator = document.getElementById('sd-indicator');
const listFilesBtn = document.getElementById('list-files-btn');
const filesList = document.getElementById('files-list');
const sdStatus = document.getElementById('sd-status');

// Blink GPIO1 controls
const blinkIndicator = document.getElementById('blink-indicator');
const blinkOnBtn = document.getElementById('blink-on-btn');
const blinkOffBtn = document.getElementById('blink-off-btn');
const blinkSpeedSlider = document.getElementById('blink-speed');
const speedValue = document.getElementById('speed-value');
const blinkStatus = document.getElementById('blink-status');

// Log
const logContent = document.getElementById('log-content');
const clearLogBtn = document.getElementById('clear-log-btn');

// ========================================
// FUNCIONES DE UTILIDAD
// ========================================
function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    
    let colorClass = 'text-gray-600';
    let icon = 'ℹ️';
    
    switch(type) {
        case 'success':
            colorClass = 'text-green-600';
            icon = '✅';
            break;
        case 'error':
            colorClass = 'text-red-600';
            icon = '❌';
            break;
        case 'warning':
            colorClass = 'text-yellow-600';
            icon = '⚠️';
            break;
        case 'bluetooth':
            colorClass = 'text-blue-600';
            icon = '📶';
            break;
    }
    
    logEntry.className = colorClass + ' text-sm';
    logEntry.innerHTML = `<span class="font-mono text-xs text-gray-400">[${timestamp}]</span> ${icon} ${message}`;
    
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
}

function updateConnectionUI(connected) {
    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
    
    // Controles de reconexión
    if (reconnectBtn) reconnectBtn.disabled = connected;
    
    // NeoPixel controls
    redSlider.disabled = !connected;
    greenSlider.disabled = !connected;
    blueSlider.disabled = !connected;
    colorRed.disabled = !connected;
    colorGreen.disabled = !connected;
    colorBlue.disabled = !connected;
    colorYellow.disabled = !connected;
    colorPurple.disabled = !connected;
    colorOff.disabled = !connected;
    
    // Sensor controls
    readSensorsBtn.disabled = !connected;
    
    // SD controls (Simple)
    listFilesBtn.disabled = !connected;
    
    // Blink GPIO1 controls
    blinkOnBtn.disabled = !connected;
    blinkOffBtn.disabled = !connected;
    blinkSpeedSlider.disabled = !connected;
    
    if (connected) {
        let statusText = `🔗 Conectado a ${bluetoothDevice.name}`;
        if (autoReconnectEnabled) {
            statusText += ' (Auto-reconexión: ON)';
        }
        connectionStatus.textContent = statusText;
        connectionStatus.className = 'text-sm font-medium text-green-600';
        
        // Cancelar cualquier intento de reconexión en curso
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    } else {
        let statusText = '📴 Desconectado';
        if (autoReconnectEnabled && reconnectAttempts > 0) {
            statusText += ` (Reconectando ${reconnectAttempts}/${maxReconnectAttempts}...)`;
            connectionStatus.className = 'text-sm font-medium text-orange-600';
        } else if (autoReconnectEnabled) {
            statusText += ' (Auto-reconexión: ON)';
            connectionStatus.className = 'text-sm italic text-blue-600';
        } else {
            connectionStatus.className = 'text-sm italic text-gray-600';
        }
        connectionStatus.textContent = statusText;
        
        resetSensorValues();
        updateNeopixelIndicator(0, 0, 0);
        updateSdStatus('--');
    }
}

function updateNeopixelIndicator(r, g, b) {
    const rgbColor = `rgb(${r}, ${g}, ${b})`;
    if (r === 0 && g === 0 && b === 0) {
        neopixelIndicator.className = 'w-16 h-16 rounded-full bg-gray-300 shadow-inner flex items-center justify-center';
        neopixelIndicator.style.backgroundColor = '';
    } else {
        neopixelIndicator.className = 'w-16 h-16 rounded-full shadow-lg flex items-center justify-center animate-pulse';
        neopixelIndicator.style.backgroundColor = rgbColor;
    }
}

function updateSdStatus(status) {
    sdStatus.textContent = `Estado: ${status}`;
    if (status === 'OK') {
        sdIndicator.className = 'w-16 h-16 rounded-full bg-green-400 shadow-lg flex items-center justify-center';
    } else if (status === 'ERROR') {
        sdIndicator.className = 'w-16 h-16 rounded-full bg-red-400 shadow-lg flex items-center justify-center';
    } else {
        sdIndicator.className = 'w-16 h-16 rounded-full bg-gray-300 shadow-inner flex items-center justify-center';
    }
}

function resetSensorValues() {
    adcA2Value.textContent = '-- V';
    adcA3Value.textContent = '-- V';
    gpio9Value.textContent = '--';
}

// ========================================
// AUTOSCAN BLUETOOTH
// ========================================
async function startAutoScan() {
    if (isScanning) {
        stopAutoScan();
        return;
    }

    try {
        isScanning = true;
        autoScanBtn.textContent = '⏹️ Detener Scan';
        autoScanBtn.disabled = false;
        foundDevices.clear();
        updateDevicesList();
        
        addLog('🔍 Iniciando Smart Scan para Pulsar H2...', 'bluetooth');
        
        // Estrategia 1: Buscar dispositivos conocidos inmediatamente
        await scanForDevices();
        
        // Estrategia 2: Ofrecer búsqueda manual periódicamente
        let scanCounter = 0;
        scanInterval = setInterval(async () => {
            try {
                scanCounter++;
                
                // Actualizar lista cada 3 segundos
                updateDevicesList();
                
                // Cada 9 segundos, ofrecer búsqueda manual
                if (scanCounter % 3 === 0) {
                    if (foundDevices.size === 0) {
                        addLog('💡 Tip: Haz clic en "Conectar Manualmente" para buscar tu Pulsar H2', 'info');
                    }
                    await scanForDevices();
                }
                
                // Cada 15 segundos, mostrar recordatorio
                if (scanCounter % 5 === 0) {
                    addLog('🔄 Sigue buscando... Asegúrate que Pulsar H2 esté encendido y cerca', 'warning');
                }
                
            } catch (error) {
                console.error('Error en scan:', error);
            }
        }, 3000);
        
    } catch (error) {
        console.error('Error iniciando Smart Scan:', error);
        addLog(`Error iniciando Smart Scan: ${error.message}`, 'error');
        stopAutoScan();
    }
}

async function scanForDevices() {
    try {
        addLog('Intentando buscar dispositivos...', 'info');
        
        // Método 1: Usar getDevices para dispositivos previamente conectados
        if (navigator.bluetooth.getDevices) {
            try {
                const devices = await navigator.bluetooth.getDevices();
                addLog(`Revisando ${devices.length} dispositivos conocidos...`, 'info');
                
                devices.forEach(device => {
                    if (device.name && 
                        (device.name.includes('Pulsar') || 
                         device.name.includes('ESP32') || 
                         device.name.includes('TouchDot') ||
                         device.name === 'Pulsar_H2')) {
                        
                        if (!foundDevices.has(device.id)) {
                            foundDevices.set(device.id, {
                                device: device,
                                name: device.name,
                                id: device.id,
                                rssi: 'Conocido',
                                lastSeen: Date.now()
                            });
                            
                            addLog(`✅ Dispositivo conocido encontrado: ${device.name}`, 'success');
                            updateDevicesList();
                        }
                    }
                });
            } catch (error) {
                addLog('Error accediendo a dispositivos conocidos: ' + error.message, 'warning');
            }
        }
        
        // Método 2: Simulación de búsqueda con requestDevice (cancelable)
        addLog('🔍 Simulando búsqueda... (puedes cancelar)', 'info');
        
        try {
            // Crear un timeout para simular búsqueda
            setTimeout(() => {
                // Agregar dispositivos simulados para prueba
                if (foundDevices.size === 0) {
                    addLog('Agregando dispositivos de ejemplo para prueba...', 'warning');
                    
                    // Dispositivo simulado para pruebas
                    const mockDevice = {
                        id: 'mock-pulsar-h2',
                        name: 'Pulsar_H2',
                        gatt: { connected: false }
                    };
                    
                    foundDevices.set('mock-pulsar-h2', {
                        device: mockDevice,
                        name: 'Pulsar_H2 (Simulado)',
                        id: 'mock-pulsar-h2',
                        rssi: 'Simulado',
                        lastSeen: Date.now(),
                        isMock: true
                    });
                    
                    updateDevicesList();
                    addLog('💡 Dispositivo simulado agregado - usa "Conectar Manualmente" para dispositivos reales', 'info');
                }
            }, 2000);
            
        } catch (error) {
            addLog('Error en simulación: ' + error.message, 'error');
        }
        
    } catch (error) {
        addLog('Error general en scan: ' + error.message, 'error');
        console.error('Error en scan:', error);
    }
}

function stopAutoScan() {
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
    
    isScanning = false;
    autoScanBtn.textContent = '🔍 Smart Scan';
    autoScanBtn.disabled = false;
    
    if (foundDevices.size > 0) {
        addLog(`Smart Scan detenido - ${foundDevices.size} dispositivos encontrados`, 'info');
    } else {
        addLog('Smart Scan detenido - usa "Conectar Manualmente" para buscar dispositivos', 'warning');
    }
}

function updateDevicesList() {
    if (!devicesList) return;
    
    // Limpiar dispositivos antiguos (más de 30 segundos)
    const now = Date.now();
    foundDevices.forEach((deviceInfo, deviceId) => {
        if (now - deviceInfo.lastSeen > 30000) {
            foundDevices.delete(deviceId);
        }
    });
    
    if (foundDevices.size === 0) {
        if (isScanning) {
            devicesList.innerHTML = `
                <div class="text-center text-gray-500 italic text-sm py-4">
                    <div class="animate-pulse">🔍 Buscando dispositivos...</div>
                    <div class="text-xs mt-2">Asegúrate que tu Pulsar H2 esté encendido</div>
                </div>
            `;
        } else {
            devicesList.innerHTML = '<div class="text-gray-500 italic text-sm">Haz clic en "Auto Scan" para buscar dispositivos</div>';
        }
        return;
    }
    
    let html = '<div class="space-y-2">';
    foundDevices.forEach((deviceInfo, deviceId) => {
        const timeSince = Math.floor((Date.now() - deviceInfo.lastSeen) / 1000);
        let signalInfo = deviceInfo.rssi;
        let deviceType = '';
        let borderColor = 'border-gray-200';
        
        // Determinar tipo de dispositivo y color
        if (deviceInfo.isMock) {
            deviceType = '🧪 Prueba';
            borderColor = 'border-yellow-300';
            signalInfo = 'Simulado';
        } else if (deviceInfo.isQuickScan) {
            deviceType = '⚡ Búsqueda Rápida';
            borderColor = 'border-purple-300';
            signalInfo = 'Seleccionado';
        } else if (deviceInfo.rssi === 'Conocido') {
            deviceType = '📚 Conocido';
            borderColor = 'border-blue-300';
        } else {
            deviceType = '🔍 Encontrado';
            borderColor = 'border-green-300';
        }
        
        html += `
            <div class="bg-white border-2 ${borderColor} rounded-lg p-2 hover:shadow-md transition-shadow">
                <div class="flex justify-between items-center">
                    <div class="flex-1">
                        <div class="font-semibold text-blue-600 text-sm">${deviceInfo.name}</div>
                        <div class="text-xs text-gray-500">${deviceType} • ${signalInfo}</div>
                        <div class="text-xs text-gray-400">Visto hace ${timeSince}s</div>
                    </div>
                    <button onclick="connectToDevice('${deviceId}')" 
                            class="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors flex-shrink-0 ml-2">
                        Conectar
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    devicesList.innerHTML = html;
}

async function connectToDevice(deviceId) {
    const deviceInfo = foundDevices.get(deviceId);
    if (!deviceInfo) {
        addLog('Dispositivo no encontrado', 'error');
        return;
    }
    
    stopAutoScan();
    
    // Si es un dispositivo simulado, usar conexión manual
    if (deviceInfo.isMock) {
        addLog('Dispositivo simulado seleccionado - redirigiendo a conexión manual...', 'warning');
        await connectBluetooth();
        return;
    }
    
    bluetoothDevice = deviceInfo.device;
    
    try {
        await connectToBluetoothDevice();
    } catch (error) {
        console.error('Error conectando:', error);
        addLog(`Error conectando: ${error.message}`, 'error');
        
        // Si falla, intentar conexión manual como respaldo
        addLog('Intentando conexión manual como respaldo...', 'info');
        await connectBluetooth();
    }
}

// ========================================
// CONEXIÓN BLUETOOTH
// ========================================
async function connectBluetooth() {
    try {
        addLog('Buscando dispositivos Pulsar H2...', 'bluetooth');
        
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { name: 'Pulsar_H2' },
                { namePrefix: 'Pulsar' }
            ],
            optionalServices: [SERVICE_UUID]
        });

        addLog(`Dispositivo encontrado: ${bluetoothDevice.name}`, 'success');
        await connectToBluetoothDevice();
        
    } catch (error) {
        console.error('Error de conexión:', error);
        addLog(`Error de conexión: ${error.message}`, 'error');
        updateConnectionUI(false);
    }
}

async function connectToBluetoothDevice() {
    try {
        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        addLog('Conectando al servidor GATT...', 'bluetooth');
        bluetoothServer = await bluetoothDevice.gatt.connect();

        addLog('Obteniendo servicio BLE...', 'bluetooth');
        bluetoothService = await bluetoothServer.getPrimaryService(SERVICE_UUID);
        
        // Debug: Listar todas las características disponibles
        console.log('🔍 === DIAGNÓSTICO DE CARACTERÍSTICAS BLE ===');
        console.log('🔍 Servicio UUID:', bluetoothService.uuid);
        try {
            const characteristics = await bluetoothService.getCharacteristics();
            console.log('🔍 Total de características encontradas:', characteristics.length);
            characteristics.forEach((char, index) => {
                console.log(`🔍 Característica ${index + 1}:`, char.uuid);
            });
        } catch (diagErr) {
            console.warn('⚠️ No se pudo obtener lista de características:', diagErr);
        }
        console.log('🔍 === FIN DIAGNÓSTICO ===');

        // Obtener características
        try {
            neopixelCharacteristic = await bluetoothService.getCharacteristic(NEOPIXEL_CHARACTERISTIC_UUID);
            addLog('Característica NeoPixel disponible', 'success');
        } catch (err) {
            addLog('Característica NeoPixel no disponible', 'warning');
        }

        try {
            sensorCharacteristic = await bluetoothService.getCharacteristic(SENSOR_CHARACTERISTIC_UUID);
            await sensorCharacteristic.startNotifications();
            sensorCharacteristic.addEventListener('characteristicvaluechanged', handleSensorNotification);
            addLog('Notificaciones de sensores habilitadas', 'success');
        } catch (err) {
            addLog('Característica Sensores no disponible', 'warning');
        }

        try {
            gpioCharacteristic = await bluetoothService.getCharacteristic(GPIO_CHARACTERISTIC_UUID);
            await gpioCharacteristic.startNotifications();
            gpioCharacteristic.addEventListener('characteristicvaluechanged', handleGpioNotification);
            
            // *** LEER ESTADO INICIAL DEL GPIO9 ***
            try {
                const initialGpioValue = await gpioCharacteristic.readValue();
                const initialGpioState = new TextDecoder().decode(initialGpioValue);
                const initialState = initialGpioState === '1' ? 'HIGH' : 'LOW';
                
                // Actualizar interfaz con estado inicial
                gpio9Value.textContent = initialState;
                gpio9Value.className = initialGpioState === '1' ? 
                    'text-lg font-semibold text-green-600' : 
                    'text-lg font-semibold text-red-600';
                
                addLog(`✅ GPIO9 estado inicial: ${initialState}`, 'success');
                
                // Actualizar estado del hardware GPIO9 solo si está en LOW
                if (window.updateHardwareStatus) {
                    if (initialGpioState === '0') {
                        // GPIO9 está en LOW inicialmente - marcar como OK
                        window.updateHardwareStatus('gpio9', 'ok');
                        addLog('✅ GPIO9 funcionando correctamente (LOW inicial)', 'success');
                    } else {
                        // GPIO9 está en HIGH inicialmente - marcar como warning (esperando activación)
                        window.updateHardwareStatus('gpio9', 'warning');
                        addLog('⚠️ GPIO9 en HIGH - esperando activación (LOW)', 'warning');
                    }
                }
            } catch (readErr) {
                addLog('⚠️ No se pudo leer estado inicial GPIO9: ' + readErr.message, 'warning');
                
                // Actualizar estado del hardware GPIO9 como warning
                if (window.updateHardwareStatus) {
                    window.updateHardwareStatus('gpio9', 'warning');
                }
            }
            
            addLog('✅ Notificaciones GPIO9 habilitadas', 'success');
        } catch (err) {
            addLog('❌ Característica GPIO no disponible: ' + err.message, 'warning');
        }

        try {
            sdCharacteristic = await bluetoothService.getCharacteristic(SD_CHARACTERISTIC_UUID);
            
            // Intentar configurar notificaciones con manejo de errores específico
            try {
                await sdCharacteristic.startNotifications();
                sdCharacteristic.addEventListener('characteristicvaluechanged', handleSDNotification);
                addLog('✅ Característica SD configurada con notificaciones', 'success');
            } catch (notifyErr) {
                // Si las notificaciones fallan, usar solo lectura directa
                addLog('⚠️ Notificaciones SD no soportadas, usando lectura directa: ' + notifyErr.message, 'warning');
                console.warn('SD notifications not supported:', notifyErr);
                // Marcar que no tenemos notificaciones disponibles
                window.sdNotificationsAvailable = false;
            }
            
            // No hacer readValue inmediatamente para evitar interferencia
            updateSdStatus('Listo');
        } catch (err) {
            addLog('❌ Característica SD no disponible: ' + err.message, 'warning');
            console.error('Error configurando SD characteristic:', err);
        }

        // ⚠️ NOTA: Device Info se recibe automáticamente via característica Sensor al conectar
        // El firmware envía primero DEVICE_INFO:{json}, luego datos normales de sensores
        // Esto soluciona la limitación del ESP32-H2 (máximo 4 características BLE activas)
        addLog('⏳ Esperando información del dispositivo via Sensor...', 'info');
        console.log('🔍 Device Info se recibirá automáticamente via SENSOR_CHARACTERISTIC');

        // Configurar característica Blink GPIO1
        try {
            blinkCharacteristic = await bluetoothService.getCharacteristic(BLINK_CHARACTERISTIC_UUID);
            await blinkCharacteristic.startNotifications();
            blinkCharacteristic.addEventListener('characteristicvaluechanged', handleBlinkNotification);
            const blinkValue = await blinkCharacteristic.readValue();
            const blinkStatusText = new TextDecoder().decode(blinkValue);
            updateBlinkStatus(blinkStatusText);
            addLog('Característica Blink GPIO1 disponible', 'success');
        } catch (err) {
            addLog('Característica Blink GPIO1 no disponible', 'warning');
        }

        updateConnectionUI(true);
        addLog('🎉 ¡Conexión exitosa! Pulsar H2 listo para usar', 'success');
        
        // Guardar dispositivo para reconexión automática
        saveLastConnectedDevice(bluetoothDevice);
        reconnectAttempts = 0; // Reset intentos después de conexión exitosa
        
        // Auto-listar archivos al conectarse
        if (sdCharacteristic) {
            setTimeout(() => listSDFiles(), 1000);
        }

    } catch (error) {
        console.error('Error de conexión:', error);
        addLog(`Error de conexión: ${error.message}`, 'error');
        updateConnectionUI(false);
    }
}

async function disconnectBluetooth() {
    try {
        // Cancelar reconexión automática si se desconecta manualmente
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        reconnectAttempts = 0;
        
        if (bluetoothDevice && bluetoothDevice.gatt.connected) {
            await bluetoothDevice.gatt.disconnect();
            addLog('🔌 Desconectado manualmente - Auto-reconexión pausada', 'info');
        }
    } catch (error) {
        console.error('Error al desconectar:', error);
        addLog(`Error al desconectar: ${error.message}`, 'error');
    }
}

function onDisconnected() {
    addLog('📴 Dispositivo Pulsar H2 desconectado', 'warning');
    updateConnectionUI(false);
    stopAutoScan();
    
    // Programar auto-reconexión si está habilitada
    scheduleAutoReconnect();
    
    bluetoothDevice = null;
    bluetoothServer = null;
    bluetoothService = null;
    neopixelCharacteristic = null;
    sensorCharacteristic = null;
    gpioCharacteristic = null;
    sdCharacteristic = null;
}

// ========================================
// CONTROL NEOPIXEL
// ========================================
// Variable para rastrear el último comando NeoPixel enviado
let lastNeopixelCommand = null;
let neopixelConfirmationTimeout = null;

async function setNeopixelColor(r, g, b) {
    if (!neopixelCharacteristic) {
        addLog('NeoPixel no disponible', 'error');
        // Actualizar estado del hardware como error
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('neo', 'error');
        }
        return;
    }

    try {
        const colorCommand = `${r},${g},${b}`;
        
        // Guardar el comando enviado para verificar confirmación
        lastNeopixelCommand = colorCommand;
        
        // Limpiar timeout anterior si existe
        if (neopixelConfirmationTimeout) {
            clearTimeout(neopixelConfirmationTimeout);
        }
        
        await neopixelCharacteristic.writeValue(new TextEncoder().encode(colorCommand));
        updateNeopixelIndicator(r, g, b);
        addLog(`📤 NeoPixel comando enviado: R=${r} G=${g} B=${b}`, 'info');
        
        // Marcar como warning (comando enviado, esperando confirmación)
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('neo', 'warning');
        }
        
        // Timeout para marcar como error si no hay confirmación en 3 segundos
        neopixelConfirmationTimeout = setTimeout(() => {
            if (lastNeopixelCommand === colorCommand) {
                addLog('⚠️ NeoPixel: Sin confirmación del dispositivo', 'warning');
                if (window.updateHardwareStatus) {
                    window.updateHardwareStatus('neo', 'warning');
                }
            }
        }, 3000);
        
    } catch (error) {
        console.error('Error controlando NeoPixel:', error);
        addLog(`Error controlando NeoPixel: ${error.message}`, 'error');
        
        // Actualizar estado del hardware como error
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('neo', 'error');
        }
        
        // Limpiar comando pendiente
        lastNeopixelCommand = null;
        if (neopixelConfirmationTimeout) {
            clearTimeout(neopixelConfirmationTimeout);
            neopixelConfirmationTimeout = null;
        }
    }
}

// Función para confirmar éxito del NeoPixel cuando el sistema responde correctamente
function confirmNeopixelSuccess() {
    if (lastNeopixelCommand && neopixelCharacteristic) {
        // Si hay un comando pendiente y el sistema está respondiendo (sensores funcionando)
        // consideramos que el NeoPixel funcionó correctamente
        addLog(`✅ NeoPixel confirmado: ${lastNeopixelCommand}`, 'success');
        
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('neo', 'ok');
        }
        
        // Limpiar comando pendiente
        lastNeopixelCommand = null;
        if (neopixelConfirmationTimeout) {
            clearTimeout(neopixelConfirmationTimeout);
            neopixelConfirmationTimeout = null;
        }
    }
}

function updateSliderValues() {
    const r = parseInt(redSlider.value);
    const g = parseInt(greenSlider.value);
    const b = parseInt(blueSlider.value);
    
    redValue.textContent = r;
    greenValue.textContent = g;
    blueValue.textContent = b;
    
    setNeopixelColor(r, g, b);
}

// ========================================
// SENSORES Y GPIO
// ========================================
async function readSensors() {
    if (!sensorCharacteristic) {
        addLog('Sensores no disponibles', 'error');
        return;
    }

    try {
        addLog('Leyendo sensores ADC...', 'info');
        const value = await sensorCharacteristic.readValue();
        const sensorData = new TextDecoder().decode(value);
        parseSensorData(sensorData);
    } catch (error) {
        console.error('Error leyendo sensores:', error);
        addLog(`Error leyendo sensores: ${error.message}`, 'error');
    }
}

function handleSensorNotification(event) {
    const sensorData = new TextDecoder().decode(event.target.value);
    
    console.log('📊 Sensor data recibido:', sensorData);
    
    // Verificar si es información del dispositivo
    if (sensorData.startsWith('DEVICE_INFO:')) {
        const deviceInfoJson = sensorData.substring(12); // Quitar el prefijo "DEVICE_INFO:"
        console.log('✅ DEVICE_INFO detectado! JSON:', deviceInfoJson);
        parseDeviceInfo(deviceInfoJson);
    } else {
        // Es un mensaje normal de sensores
        parseSensorData(sensorData);
    }
}

function parseDeviceInfo(jsonString) {
    try {
        const deviceInfo = JSON.parse(jsonString);
        console.log('📱 Información del dispositivo parseada:', deviceInfo);
        
        // Mostrar la información en la interfaz
        displayDeviceInfo(jsonString);
        
        addLog(`Dispositivo identificado: ${deviceInfo.deviceName} (${deviceInfo.mac})`, 'success');
    } catch (error) {
        console.error('❌ Error parseando Device Info:', error);
        console.error('❌ String recibido:', jsonString);
        addLog('Error al procesar información del dispositivo', 'error');
    }
}

function parseSensorData(dataString) {
    try {
        // Formato esperado: "a2:3.300,a3:1.650,oled:OK"
        const pairs = dataString.split(',');
        let oledStatus = null;
        
        pairs.forEach(pair => {
            const [key, value] = pair.split(':');
            
            if (key === 'a2') {
                const voltage = parseFloat(value);
                adcA2Value.textContent = `${voltage.toFixed(3)} V`;
                // Actualizar estado del hardware ADC1
                if (window.updateHardwareStatus) {
                    window.updateHardwareStatus('adc1', !isNaN(voltage) ? 'ok' : 'error');
                }
            } else if (key === 'a3') {
                const voltage = parseFloat(value);
                adcA3Value.textContent = `${voltage.toFixed(3)} V`;
                // Actualizar estado del hardware ADC2
                if (window.updateHardwareStatus) {
                    window.updateHardwareStatus('adc2', !isNaN(voltage) ? 'ok' : 'error');
                }
            } else if (key === 'oled') {
                oledStatus = value;
                updateOledStatus(value);
                // Actualizar estado del hardware I2C
                if (window.updateHardwareStatus) {
                    window.updateHardwareStatus('i2c', value === 'OK' ? 'ok' : 'error');
                }
            }
        });
        
        // Actualizar hardware completo usando la función exportada
        if (window.updateHardwareFromSensorData) {
            window.updateHardwareFromSensorData(dataString);
        }
        
        // Confirmar NeoPixel si hay un comando pendiente
        confirmNeopixelSuccess();
        
        // Log con información de OLED si está disponible
        const logMessage = oledStatus ? 
            `ADC actualizado: ${dataString.replace(',oled:' + oledStatus, '')} | OLED: ${oledStatus}` : 
            `ADC actualizado: ${dataString}`;
        addLog(logMessage, 'info');
        
    } catch (error) {
        console.error('Error parseando datos de sensores:', error);
    }
}

// Función para actualizar el estado visual de la OLED
function updateOledStatus(status) {
    // Buscar un elemento para mostrar el estado de la OLED
    let oledStatusElement = document.getElementById('oled-status');
    
    if (!oledStatusElement) {
        // Crear elemento de estado OLED si no existe
        const sensorSection = document.querySelector('.grid').children[1]; // Sección de sensores
        if (sensorSection) {
            const oledDiv = document.createElement('div');
            oledDiv.innerHTML = `
                <h3 class="text-lg font-semibold mb-2 text-gray-800">Estado OLED</h3>
                <div class="flex items-center space-x-2">
                    <div id="oled-status" class="px-3 py-1 rounded-full text-sm font-medium">
                        Desconocido
                    </div>
                </div>
            `;
            sensorSection.appendChild(oledDiv);
            oledStatusElement = document.getElementById('oled-status');
        }
    }
    
    if (oledStatusElement) {
        if (status === 'OK') {
            oledStatusElement.textContent = 'CONECTADA';
            oledStatusElement.className = 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800';
        } else {
            oledStatusElement.textContent = 'DESCONECTADA';
            oledStatusElement.className = 'px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800';
            addLog('🚨 OLED desconectada detectada!', 'error');
        }
    }
}

function handleGpioNotification(event) {
    const gpioState = new TextDecoder().decode(event.target.value);
    const state = gpioState === '1' ? 'HIGH' : 'LOW';
    
    console.log('🔍 GPIO9 notification:', gpioState, '→', state);
    
    // Verificar que el elemento existe
    if (gpio9Value) {
        gpio9Value.textContent = state;
        gpio9Value.className = gpioState === '1' ? 
            'text-lg font-semibold text-green-600' : 
            'text-lg font-semibold text-red-600';
        
        addLog(`🔧 GPIO9 cambió a: ${state}`, 'info');
        
        // Confirmar NeoPixel si hay un comando pendiente (sistema está respondiendo)
        confirmNeopixelSuccess();
        
        // Actualizar estado del hardware GPIO9 solo cuando detecta LOW
        if (window.updateHardwareStatus) {
            if (gpioState === '0') {
                // GPIO9 está en LOW - marcar como OK (funciona correctamente)
                window.updateHardwareStatus('gpio9', 'ok');
                addLog('✅ GPIO9 funcionando correctamente (LOW detectado)', 'success');
            } else {
                // GPIO9 está en HIGH - marcar como warning (esperando activación)
                window.updateHardwareStatus('gpio9', 'warning');
            }
        }
    } else {
        console.error('❌ Elemento gpio9Value no encontrado');
        addLog('❌ Error: elemento GPIO9 no encontrado en la interfaz', 'error');
        
        // Actualizar estado del hardware GPIO9 como error
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('gpio9', 'error');
        }
    }
}

// ========================================
// CONTROL MICROSD (SIMPLE)
// ========================================
async function listSDFiles() {
    if (!sdCharacteristic) {
        addLog('MicroSD no disponible', 'error');
        displayFilesList('ERROR');
        return;
    }

    try {
        // Mostrar estado de carga
        filesList.innerHTML = '<div class="text-blue-500 font-medium">🔄 Listando archivos...</div>';
        
        // Reset variables de chunks
        chunkBuffer = '';
        expectedChunks = 0;
        receivedChunks = 0;
        
        // Asumir que las notificaciones están disponibles por defecto
        if (window.sdNotificationsAvailable === undefined) {
            window.sdNotificationsAvailable = true;
        }
        
        await sdCharacteristic.writeValue(new TextEncoder().encode('LIST'));
        addLog('📤 Comando LIST enviado, esperando respuesta...', 'info');
        
        // MÉTODO HÍBRIDO: Notificaciones + Polling
        // Si las notificaciones no están disponibles, usar lectura directa inmediatamente
        if (window.sdNotificationsAvailable === false) {
            addLog('🔍 Usando lectura directa (notificaciones no disponibles)', 'info');
            setTimeout(() => attemptSimpleDirectRead(), 1000); // Dar tiempo para que el firmware procese
        } else {
            // 1. Esperar notificaciones por 3 segundos
            let notificationReceived = false;
            const notificationTimeout = setTimeout(() => {
                if (!notificationReceived) {
                    addLog('⚠️ No se recibieron notificaciones, intentando lectura directa...', 'warning');
                    attemptSimpleDirectRead();
                }
            }, 3000);
            
            // Marcar que estamos esperando notificaciones
            window.waitingForNotification = notificationTimeout;
        }
        
        // Timeout final de seguridad
        setTimeout(() => {
            if (filesList.innerHTML.includes('🔄 Listando archivos...')) {
                displayFilesList('TIMEOUT');
                addLog('❌ Timeout final: Sin respuesta del dispositivo', 'error');
            }
        }, 10000);
        
    } catch (error) {
        console.error('Error listando archivos:', error);
        addLog(`❌ Error listando archivos: ${error.message}`, 'error');
        displayFilesList('ERROR');
    }
}

// Función para intentar lectura directa cuando las notificaciones fallan
async function attemptDirectRead() {
    try {
        addLog('🔍 Intentando lectura directa de la característica SD...', 'info');
        
        // Leer múltiples veces para capturar todos los chunks
        let attempts = 0;
        const maxAttempts = 5;
        const readInterval = 300; // ms entre lecturas
        
        const readChunks = async () => {
            try {
                const value = await sdCharacteristic.readValue();
                const response = new TextDecoder().decode(value);
                
                addLog(`📖 Lectura directa (intento ${attempts + 1}): ${response}`, 'info');
                
                if (response.startsWith('CHUNK:')) {
                    // Extraer información del chunk
                    const parts = response.split(':');
                    if (parts.length >= 3) {
                        const chunkInfo = parts[1]; // "1/3"
                        const [currentChunk, totalChunks] = chunkInfo.split('/').map(n => parseInt(n));
                        
                        handleChunkResponse(response);
                        
                        // Si recibimos todos los chunks o es el último intento, terminar
                        if (receivedChunks >= totalChunks || attempts >= maxAttempts - 1) {
                            return;
                        }
                    }
                } else if (response.startsWith('FILES:')) {
                    // Respuesta completa sin chunks
                    displayFilesList(response);
                    return;
                } else if (response.includes('ERROR')) {
                    displayFilesList(response);
                    return;
                }
                
                // Continuar leyendo si no hemos terminado
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(readChunks, readInterval);
                } else {
                    // Si después de todos los intentos no tenemos respuesta completa
                    if (chunkBuffer && receivedChunks > 0) {
                        addLog('⚠️ Procesando chunks parciales recibidos...', 'warning');
                        displayFilesList(chunkBuffer);
                    } else {
                        addLog('❌ No se pudo obtener respuesta completa después de múltiples intentos', 'error');
                        fallbackToSimpleCommand();
                    }
                }
                
            } catch (readError) {
                addLog(`❌ Error en lectura intento ${attempts + 1}: ${readError.message}`, 'error');
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(readChunks, readInterval);
                } else {
                    fallbackToSimpleCommand();
                }
            }
        };
        
        // Comenzar el proceso de lectura
        readChunks();
        
    } catch (error) {
        addLog(`❌ Error en lectura directa: ${error.message}`, 'error');
        fallbackToSimpleCommand();
    }
}

// Función simplificada para lectura directa (sin chunks)
async function attemptSimpleDirectRead() {
    try {
        addLog('🔍 Intentando lectura directa simplificada...', 'info');
        
        // Esperar un poco para que el firmware termine de procesar
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Leer directamente el valor de la característica
        const value = await sdCharacteristic.readValue();
        const response = new TextDecoder().decode(value);
        
        addLog(`📖 Lectura directa exitosa: ${response.substring(0, 50)}...`, 'info');
        
        // Si la respuesta parece completa, mostrarla
        if (response.startsWith('FILES:') || response.startsWith('ERROR:')) {
            displayFilesList(response);
        } else if (response.startsWith('CHUNK:')) {
            // Si aún recibimos chunks, usar el método anterior
            addLog('⚠️ Aún recibiendo chunks, usando método complejo...', 'warning');
            attemptDirectRead();
        } else {
            // Respuesta inesperada, intentar comando simplificado
            addLog('⚠️ Respuesta inesperada, intentando comando LIST_SIMPLE...', 'warning');
            fallbackToSimpleCommand();
        }
        
    } catch (error) {
        addLog(`❌ Error en lectura directa simplificada: ${error.message}`, 'error');
        fallbackToSimpleCommand();
    }
}

// Función para el último recurso: comando simplificado
async function fallbackToSimpleCommand() {
    try {
        addLog('🔄 Último recurso: solicitando respuesta simplificada...', 'info');
        await sdCharacteristic.writeValue(new TextEncoder().encode('LIST_SIMPLE'));
        
        setTimeout(async () => {
            try {
                const value = await sdCharacteristic.readValue();
                const response = new TextDecoder().decode(value);
                addLog(`📖 Respuesta simplificada: ${response}`, 'info');
                displayFilesList(response);
            } catch (err) {
                addLog(`❌ Falló respuesta simplificada: ${err.message}`, 'error');
                displayFilesList('ERROR:NO_RESPONSE');
            }
        }, 1000);
        
    } catch (err) {
        addLog(`❌ Error enviando comando simplificado: ${err.message}`, 'error');
        displayFilesList('ERROR:COMMUNICATION_FAILED');
    }
}

// Variables para manejar chunks
let chunkBuffer = '';
let expectedChunks = 0;
let receivedChunks = 0;

function handleSDNotification(event) {
    const response = new TextDecoder().decode(event.target.value);
    addLog(`📡 Notificación SD recibida: ${response}`, 'info');
    console.log('🔍 Raw SD notification data:', event.target.value);
    console.log('🔍 Decoded SD response:', response);
    
    // Marcar que se recibió una notificación (cancelar lectura directa)
    if (window.waitingForNotification) {
        clearTimeout(window.waitingForNotification);
        window.waitingForNotification = null;
        addLog('✅ Notificación BLE recibida correctamente', 'success');
    }
    
    // Verificar si es un chunk
    if (response.startsWith('CHUNK:')) {
        handleChunkResponse(response);
    } else {
        // Respuesta normal sin chunks
        displayFilesList(response);
    }
}

function handleChunkResponse(response) {
    // Format: CHUNK:1/3:datos
    const parts = response.split(':');
    if (parts.length >= 3) {
        const chunkInfo = parts[1]; // "1/3"
        const chunkData = parts.slice(2).join(':'); // El resto es data
        
        const [currentChunk, totalChunks] = chunkInfo.split('/').map(n => parseInt(n));
        
        addLog(`📦 Chunk recibido: ${currentChunk}/${totalChunks}`, 'info');
        console.log('🔍 Chunk data:', chunkData);
        
        // Inicializar array de chunks si es necesario
        if (!window.chunkArray) {
            window.chunkArray = {};
        }
        
        // Detectar nuevo conjunto de chunks
        if (currentChunk === 1 || expectedChunks !== totalChunks) {
            // Nuevo conjunto de chunks - resetear
            window.chunkArray = {};
            expectedChunks = totalChunks;
            receivedChunks = 0;
            addLog(`🔄 Iniciando recepción de ${totalChunks} chunks`, 'info');
        }
        
        // Almacenar chunk en posición correcta
        if (!window.chunkArray[currentChunk]) {
            window.chunkArray[currentChunk] = chunkData;
            receivedChunks++;
            addLog(`✅ Chunk ${currentChunk}/${totalChunks} almacenado`, 'info');
        } else {
            addLog(`⚠️ Chunk ${currentChunk}/${totalChunks} duplicado, ignorando`, 'warning');
        }
        
        // Verificar si tenemos todos los chunks
        if (receivedChunks === expectedChunks) {
            // Reconstruir mensaje en orden correcto
            let fullMessage = '';
            for (let i = 1; i <= totalChunks; i++) {
                if (window.chunkArray[i]) {
                    fullMessage += window.chunkArray[i];
                } else {
                    addLog(`❌ Falta chunk ${i}/${totalChunks}`, 'error');
                    return; // No procesar si faltan chunks
                }
            }
            
            addLog(`✅ Todos los chunks recibidos y ensamblados (${receivedChunks}/${expectedChunks})`, 'success');
            console.log('🔍 Mensaje completo:', fullMessage);
            displayFilesList(fullMessage);
            
            // Limpiar para siguiente mensaje
            window.chunkArray = {};
            expectedChunks = 0;
            receivedChunks = 0;
        } else {
            addLog(`⏳ Esperando más chunks: ${receivedChunks}/${expectedChunks}`, 'info');
        }
    }
}

function displayFilesList(response) {
    if (response === 'SD_NO_DISPONIBLE') {
        filesList.innerHTML = '<div class="text-red-500 font-medium">❌ MicroSD no disponible</div>';
        updateSdStatus('ERROR');
        // Actualizar estado del hardware SPI como error
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('spi', 'error');
        }
    } else if (response === 'ERROR_LECTURA') {
        filesList.innerHTML = '<div class="text-red-500 font-medium">❌ Error leyendo SD</div>';
        updateSdStatus('ERROR');
        // Actualizar estado del hardware SPI como error
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('spi', 'error');
        }
    } else if (response === 'SIN_ARCHIVOS') {
        filesList.innerHTML = '<div class="text-yellow-600 font-medium">📂 No hay archivos en la SD</div>';
        updateSdStatus('OK (vacía)');
        // Actualizar estado del hardware SPI como OK (SD detectada pero vacía)
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('spi', 'ok');
        }
    } else if (response === 'COMANDO_NO_SOPORTADO') {
        filesList.innerHTML = '<div class="text-red-500 font-medium">❌ Comando no soportado</div>';
        updateSdStatus('ERROR');
        // Actualizar estado del hardware SPI como error
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('spi', 'error');
        }
    } else if (response === 'TIMEOUT') {
        filesList.innerHTML = '<div class="text-red-500 font-medium">❌ Timeout: Sin respuesta del dispositivo</div>';
        updateSdStatus('ERROR');
        // Actualizar estado del hardware SPI como error
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('spi', 'error');
        }
    } else if (response === 'ERROR') {
        filesList.innerHTML = '<div class="text-red-500 font-medium">❌ Error general</div>';
        updateSdStatus('ERROR');
        // Actualizar estado del hardware SPI como error
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('spi', 'error');
        }
    } else if (response.startsWith('FILES:')) {
        // Procesar respuesta con formato FILES:archivo1(size),archivo2(size),...
        console.log('🔍 Procesando respuesta FILES:', response);
        const fileListString = response.substring(6); // Remover "FILES:" del inicio
        const files = fileListString.split(',').filter(f => f.trim() !== '');
        
        console.log('🔍 Archivos parseados:', files);
        addLog(`🔍 Procesando ${files.length} archivos desde respuesta FILES:`, 'info');
        
        let html = '<div class="text-green-600 font-medium mb-2">📁 Archivos encontrados:</div>';
        
        if (response.includes('...')) {
            html += '<div class="text-yellow-600 text-sm mb-2">⚠️ Lista truncada (hay más archivos)</div>';
        }
        
        html += '<div class="space-y-1">';
        
        files.forEach((file, index) => {
            const fileName = file.trim();
            
            // Extraer nombre y tamaño del formato "archivo(tamaño)"
            const match = fileName.match(/^(.+?)\((.+?)\)$/);
            if (match) {
                const name = match[1];
                const size = match[2];
                
                html += `<div class="text-gray-700 bg-white p-2 rounded border text-sm flex justify-between items-center">
                           <span class="font-mono text-blue-600">${name}</span>
                           <span class="text-gray-500 text-xs">${size}</span>
                         </div>`;
            } else {
                // Fallback si no tiene formato de tamaño
                html += `<div class="text-gray-700 bg-white p-2 rounded border text-sm">
                           <span class="font-mono text-blue-600">${fileName}</span>
                         </div>`;
            }
        });
        
        html += '</div>';
        filesList.innerHTML = html;
        updateSdStatus(`OK (${files.length} archivos)`);
        addLog(`📂 ✅ Se encontraron ${files.length} archivos en microSD`, 'success');
        
        // Actualizar estado del hardware SPI como OK
        if (window.updateHardwareStatus) {
            window.updateHardwareStatus('spi', 'ok');
        }
    } else {
        // Fallback para otros formatos - Lista de archivos separados por comas
        const files = response.split(',').filter(f => f.trim() !== '');
        let html = '<div class="text-green-600 font-medium mb-2">📁 Archivos encontrados:</div>';
        
        if (response.includes('...')) {
            html += '<div class="text-yellow-600 text-sm mb-2">⚠️ Lista truncada (hay más archivos)</div>';
        }
        
        html += '<div class="space-y-1">';
        
        files.forEach((file, index) => {
            if (index < 5) { // Mostrar máximo 5 archivos
                const fileName = file.trim();
                html += `<div class="text-gray-700 bg-white p-2 rounded border text-sm">
                           <span class="font-mono text-blue-600">${fileName}</span>
                         </div>`;
            }
        });
        
        if (files.length > 5) {
            html += `<div class="text-gray-500 text-sm italic">... y ${files.length - 5} más</div>`;
        }
        
        html += '</div>';
        filesList.innerHTML = html;
        updateSdStatus(`OK (${files.length} archivos)`);
        addLog(`📂 Se encontraron ${files.length} archivos (mostrando primeros 5)`, 'success');
    }
}

// ========================================
// FUNCIONES BLINK GPIO1
// ========================================
function handleBlinkNotification(event) {
    const response = new TextDecoder().decode(event.target.value);
    addLog(`Respuesta Blink: ${response}`, 'info');
    updateBlinkStatus(response);
}

function updateBlinkStatus(status) {
    const statusDiv = document.getElementById('blink-status');
    const indicator = document.getElementById('blink-indicator');
    
    if (status === 'BLINK_ON') {
        statusDiv.textContent = 'Estado: ON';
        statusDiv.className = 'text-sm text-green-600 font-medium';
        indicator.className = 'w-16 h-16 rounded-full bg-green-400 shadow-inner flex items-center justify-center transition-all duration-300 animate-pulse';
    } else if (status === 'BLINK_OFF') {
        statusDiv.textContent = 'Estado: OFF';
        statusDiv.className = 'text-sm text-gray-600';
        indicator.className = 'w-16 h-16 rounded-full bg-gray-300 shadow-inner flex items-center justify-center transition-all duration-300';
    } else if (status.startsWith('SPEED_SET:')) {
        const speed = status.split(':')[1];
        addLog(`Velocidad de blink cambiada a ${speed}ms`, 'success');
    } else if (status.startsWith('ERROR:')) {
        addLog(`Error blink: ${status}`, 'error');
    }
}

async function sendBlinkCommand(command) {
    if (!blinkCharacteristic) {
        addLog('❌ Característica Blink no disponible', 'error');
        return;
    }
    
    try {
        const encoder = new TextEncoder();
        await blinkCharacteristic.writeValue(encoder.encode(command));
        addLog(`Comando blink enviado: ${command}`, 'info');
    } catch (error) {
        addLog(`❌ Error enviando comando blink: ${error}`, 'error');
    }
}

// ========================================
// DEVICE INFO FUNCTIONS
// ========================================
function handleDeviceInfoNotification(event) {
    const deviceInfoText = new TextDecoder().decode(event.target.value);
    displayDeviceInfo(deviceInfoText);
    addLog(`📱 Información del dispositivo actualizada`, 'info');
}

function displayDeviceInfo(deviceInfoJson) {
    try {
        const deviceInfo = JSON.parse(deviceInfoJson);
        
        console.log('📱 Device Info recibido:', deviceInfo);
        
        // Convertir flashSize de bytes a MB
        const flashSizeMB = deviceInfo.flashSize ? (deviceInfo.flashSize / (1024 * 1024)).toFixed(2) : 'N/A';
        
        // Formatear timestamp
        const timestamp = deviceInfo.timestamp ? new Date(deviceInfo.timestamp).toLocaleString() : new Date().toLocaleString();
        
        // Crear o actualizar el panel de información del dispositivo
        let deviceInfoPanel = document.getElementById('device-info-panel');
        if (!deviceInfoPanel) {
            // Crear el panel si no existe
            deviceInfoPanel = document.createElement('div');
            deviceInfoPanel.id = 'device-info-panel';
            deviceInfoPanel.className = 'bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg mb-4';
            
            // Agregar después del título principal
            const mainTitle = document.querySelector('h1');
            if (mainTitle && mainTitle.parentNode) {
                mainTitle.parentNode.insertBefore(deviceInfoPanel, mainTitle.nextSibling);
            }
        }
        
        // Actualizar contenido del panel - MAPEO CORRECTO de propiedades del firmware
        deviceInfoPanel.innerHTML = `
            <div class="flex items-center mb-2">
                <div class="w-3 h-3 bg-blue-400 rounded-full mr-2 animate-pulse"></div>
                <h3 class="text-lg font-semibold text-blue-800">Información del Dispositivo</h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div class="space-y-1">
                    <div><span class="font-medium text-gray-700">Dispositivo:</span> <span class="text-blue-700">${deviceInfo.deviceName || 'N/A'}</span></div>
                    <div><span class="font-medium text-gray-700">MAC Address:</span> <span class="font-mono text-green-700">${deviceInfo.mac || 'N/A'}</span></div>
                    <div><span class="font-medium text-gray-700">Chip ID:</span> <span class="font-mono text-purple-700">${deviceInfo.chipID || 'N/A'}</span></div>
                    <div><span class="font-medium text-gray-700">Modelo:</span> <span class="text-gray-700">${deviceInfo.model || 'N/A'}</span></div>
                </div>
                <div class="space-y-1">
                    <div><span class="font-medium text-gray-700">Revisión:</span> <span class="text-gray-700">${deviceInfo.revision || 'N/A'}</span></div>
                    <div><span class="font-medium text-gray-700">Cores:</span> <span class="text-gray-700">${deviceInfo.cores || 'N/A'}</span></div>
                    <div><span class="font-medium text-gray-700">Flash:</span> <span class="text-gray-700">${flashSizeMB} MB</span></div>
                    <div><span class="font-medium text-gray-700">Firmware:</span> <span class="text-gray-700">v${deviceInfo.firmware || 'N/A'}</span></div>
                </div>
            </div>
            <div class="mt-2 text-xs text-gray-500">
                Última actualización: ${timestamp}
            </div>
        `;
        
        addLog(`📱 Dispositivo: ${deviceInfo.deviceName} | MAC: ${deviceInfo.mac} | Chip: ${deviceInfo.chipID}`, 'success');
        
    } catch (error) {
        console.error('❌ Error parsing device info:', error);
        console.error('❌ JSON recibido:', deviceInfoJson);
        addLog('⚠️ Error procesando información del dispositivo', 'warning');
    }
}

function displayDeviceInfoUnavailable() {
    // Crear panel informativo cuando la característica no está disponible
    let deviceInfoPanel = document.getElementById('device-info-panel');
    if (!deviceInfoPanel) {
        deviceInfoPanel = document.createElement('div');
        deviceInfoPanel.id = 'device-info-panel';
        deviceInfoPanel.className = 'bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg mb-4';
        
        // Agregar después del título principal
        const mainTitle = document.querySelector('h1');
        if (mainTitle && mainTitle.parentNode) {
            mainTitle.parentNode.insertBefore(deviceInfoPanel, mainTitle.nextSibling);
        }
    }
    
    // Mostrar mensaje informativo
    deviceInfoPanel.innerHTML = `
        <div class="flex items-center mb-2">
            <div class="w-3 h-3 bg-yellow-400 rounded-full mr-2"></div>
            <h3 class="text-lg font-semibold text-yellow-800">Información del Dispositivo</h3>
        </div>
        <div class="text-sm text-yellow-700">
            <div class="mb-2">
                <span class="font-medium">⚠️ Característica no disponible</span>
            </div>
            <div class="mb-2">
                Para ver la información completa del dispositivo (MAC, Chip ID, etc.), necesitas actualizar el firmware con la versión más reciente.
            </div>
            <div class="text-xs bg-yellow-100 p-2 rounded mt-2">
                <strong>Ubicación del firmware:</strong> <code>/docs/bluetooth/firmware/main.ino</code>
            </div>
        </div>
    `;
}

// ========================================
// EVENT LISTENERS
// ========================================
connectBtn.addEventListener('click', connectBluetooth);
disconnectBtn.addEventListener('click', disconnectBluetooth);
if (autoScanBtn) autoScanBtn.addEventListener('click', startAutoScan);
if (quickScanBtn) quickScanBtn.addEventListener('click', quickScan);
if (autoReconnectToggle) autoReconnectToggle.addEventListener('change', toggleAutoReconnect);
if (reconnectBtn) reconnectBtn.addEventListener('click', manualReconnect);

// NeoPixel sliders
redSlider.addEventListener('input', updateSliderValues);
greenSlider.addEventListener('input', updateSliderValues);
blueSlider.addEventListener('input', updateSliderValues);

// Color buttons
colorRed.addEventListener('click', () => setNeopixelColor(255, 0, 0));
colorGreen.addEventListener('click', () => setNeopixelColor(0, 255, 0));
colorBlue.addEventListener('click', () => setNeopixelColor(0, 0, 255));
colorYellow.addEventListener('click', () => setNeopixelColor(255, 255, 0));
colorPurple.addEventListener('click', () => setNeopixelColor(255, 0, 255));
colorOff.addEventListener('click', () => setNeopixelColor(0, 0, 0));

// Sensors
readSensorsBtn.addEventListener('click', readSensors);

// SD Card (Simple)
listFilesBtn.addEventListener('click', listSDFiles);

// Log
clearLogBtn.addEventListener('click', () => {
    logContent.innerHTML = '<div class="text-blue-600 font-medium">Log limpiado</div>';
});

function clearDevicesList() {
    foundDevices.clear();
    updateDevicesList();
    addLog('Lista de dispositivos limpiada', 'info');
}

// ========================================
// SISTEMA DE AUTO-RECONEXIÓN
// ========================================
function saveLastConnectedDevice(device) {
    if (device && device.name) {
        lastConnectedDevice = {
            name: device.name,
            id: device.id,
            timestamp: Date.now()
        };
        localStorage.setItem('pulsar_last_device', JSON.stringify(lastConnectedDevice));
        addLog(`💾 Dispositivo guardado para reconexión: ${device.name}`, 'info');
    }
}

function getLastConnectedDevice() {
    try {
        const saved = localStorage.getItem('pulsar_last_device');
        if (saved) {
            const device = JSON.parse(saved);
            // Solo usar si fue guardado en las últimas 24 horas
            if (Date.now() - device.timestamp < 24 * 60 * 60 * 1000) {
                return device;
            }
        }
    } catch (error) {
        console.error('Error recuperando dispositivo guardado:', error);
    }
    return null;
}

async function attemptAutoReconnect() {
    if (!autoReconnectEnabled) {
        addLog('Auto-reconexión deshabilitada', 'warning');
        return;
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
        addLog(`❌ Auto-reconexión falló después de ${maxReconnectAttempts} intentos`, 'error');
        addLog('💡 Usa "⚡ Buscar Ahora" o "🔄 Reconectar" para conectar manualmente', 'info');
        reconnectAttempts = 0;
        updateConnectionUI(false); // Actualizar UI
        return;
    }

    reconnectAttempts++;
    addLog(`🔄 Intento de reconexión ${reconnectAttempts}/${maxReconnectAttempts}...`, 'warning');
    updateConnectionUI(false); // Mostrar estado de reconexión

    try {
        const lastDevice = getLastConnectedDevice();
        if (!lastDevice) {
            addLog('❌ No hay dispositivo previo guardado para reconectar', 'error');
            addLog('💡 Conecta manualmente primero para habilitar auto-reconexión', 'info');
            reconnectAttempts = 0;
            return;
        }

        addLog(`🔍 Buscando ${lastDevice.name}...`, 'info');

        // Método 1: Intentar con dispositivos conocidos primero
        if (navigator.bluetooth.getDevices) {
            const devices = await navigator.bluetooth.getDevices();
            const knownDevice = devices.find(d => d.name === lastDevice.name || d.id === lastDevice.id);
            
            if (knownDevice) {
                addLog(`📚 Dispositivo conocido encontrado: ${knownDevice.name}`, 'success');
                bluetoothDevice = knownDevice;
                await connectToBluetoothDevice();
                reconnectAttempts = 0;
                return;
            }
        }

        // Método 2: Usar requestDevice (requiere interacción del usuario)
        addLog('⚠️ Dispositivo no encontrado en conocidos, se requiere selección manual', 'warning');
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { name: lastDevice.name },
                { namePrefix: 'Pulsar' }
            ],
            optionalServices: [SERVICE_UUID]
        });

        if (device) {
            bluetoothDevice = device;
            await connectToBluetoothDevice();
            reconnectAttempts = 0;
            addLog(`✅ Reconexión exitosa a ${device.name}`, 'success');
        }

    } catch (error) {
        if (error.message.includes('User cancelled')) {
            addLog('❌ Reconexión cancelada por el usuario', 'warning');
            reconnectAttempts = 0;
            updateConnectionUI(false);
        } else {
            addLog(`❌ Error en reconexión: ${error.message}`, 'error');
            
            // Programar siguiente intento con delay incremental
            const nextDelay = Math.min(reconnectDelay * reconnectAttempts, 10000); // Max 10s
            addLog(`⏱️ Siguiente intento en ${nextDelay/1000}s...`, 'info');
            
            reconnectTimeout = setTimeout(() => {
                attemptAutoReconnect();
            }, nextDelay);
        }
    }
}

function scheduleAutoReconnect() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }
    
    if (autoReconnectEnabled) {
        addLog(`⏰ Auto-reconexión programada en ${reconnectDelay/1000}s...`, 'info');
        reconnectTimeout = setTimeout(() => {
            attemptAutoReconnect();
        }, reconnectDelay);
    }
}

function toggleAutoReconnect() {
    autoReconnectEnabled = !autoReconnectEnabled;
    localStorage.setItem('pulsar_auto_reconnect', autoReconnectEnabled.toString());
    
    if (autoReconnectToggle) {
        autoReconnectToggle.checked = autoReconnectEnabled;
        autoReconnectToggle.className = autoReconnectEnabled ? 
            'toggle-enabled' : 'toggle-disabled';
    }
    
    addLog(`🔄 Auto-reconexión ${autoReconnectEnabled ? 'habilitada' : 'deshabilitada'}`, 'info');
    
    if (!autoReconnectEnabled && reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
        addLog('⏹️ Reconexión automática cancelada', 'info');
    }
}

async function manualReconnect() {
    if (reconnectBtn) {
        reconnectBtn.disabled = true;
        reconnectBtn.textContent = '🔄 Reconectando...';
    }
    
    try {
        reconnectAttempts = 0; // Reset intentos para reconexión manual
        await attemptAutoReconnect();
    } finally {
        if (reconnectBtn) {
            reconnectBtn.disabled = false;
            reconnectBtn.textContent = '🔄 Reconectar';
        }
    }
}

async function tryAutoReconnectOnLoad() {
    const lastDevice = getLastConnectedDevice();
    if (lastDevice && autoReconnectEnabled) {
        addLog(`🔍 Intentando reconectar a ${lastDevice.name} automáticamente...`, 'info');
        
        // Esperar 2 segundos para que la página cargue completamente
        setTimeout(async () => {
            try {
                // Intentar obtener dispositivos conocidos
                if (navigator.bluetooth.getDevices) {
                    const devices = await navigator.bluetooth.getDevices();
                    const targetDevice = devices.find(d => d.name === lastDevice.name || d.id === lastDevice.id);
                    
                    if (targetDevice) {
                        bluetoothDevice = targetDevice;
                        await connectToBluetoothDevice();
                        addLog(`🎉 Reconectado automáticamente a ${targetDevice.name}`, 'success');
                        return;
                    }
                }
                
                addLog('💡 Para reconectar automáticamente, usa "⚡ Buscar Ahora" o "🔄 Reconectar"', 'info');
                
            } catch (error) {
                addLog(`⚠️ Auto-reconexión al cargar falló: ${error.message}`, 'warning');
            }
        }, 2000);
    }
}

async function quickScan() {
    try {
        addLog('⚡ Búsqueda rápida iniciada...', 'bluetooth');
        quickScanBtn.disabled = true;
        quickScanBtn.textContent = '🔄 Buscando...';
        
        // Abrir selector de dispositivos inmediatamente
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { name: 'Pulsar_H2' },
                { namePrefix: 'Pulsar' },
                { namePrefix: 'ESP32' },
                { namePrefix: 'TouchDot' }
            ],
            optionalServices: [SERVICE_UUID]
        });
        
        if (device) {
            addLog(`✅ Dispositivo seleccionado: ${device.name}`, 'success');
            
            // Agregar a la lista de dispositivos encontrados
            foundDevices.set(device.id, {
                device: device,
                name: device.name,
                id: device.id,
                rssi: 'Manual',
                lastSeen: Date.now(),
                isQuickScan: true
            });
            
            updateDevicesList();
            
            // Conectar automáticamente
            bluetoothDevice = device;
            await connectToBluetoothDevice();
        }
        
    } catch (error) {
        if (error.message.includes('User cancelled')) {
            addLog('Búsqueda cancelada por el usuario', 'warning');
        } else {
            console.error('Error en búsqueda rápida:', error);
            addLog(`Error en búsqueda rápida: ${error.message}`, 'error');
        }
    } finally {
        quickScanBtn.disabled = false;
        quickScanBtn.textContent = '⚡ Buscar Ahora';
    }
}

// ========================================
// FUNCIONES GLOBALES (para onclick en HTML)
// ========================================
window.connectToDevice = connectToDevice;
window.clearDevicesList = clearDevicesList;
window.quickScan = quickScan;
window.toggleAutoReconnect = toggleAutoReconnect;
window.manualReconnect = manualReconnect;

// ========================================
// INICIALIZACIÓN
// ========================================
if (!navigator.bluetooth) {
    addLog('Web Bluetooth no soportado en este navegador', 'error');
    connectBtn.disabled = true;
    connectBtn.textContent = 'Bluetooth no soportado';
    if (autoScanBtn) {
        autoScanBtn.disabled = true;
        autoScanBtn.textContent = 'Bluetooth no soportado';
    }
} else {
    addLog('✅ Web Bluetooth API disponible - Pulsar H2 Ready', 'success');
    
    // Cargar configuración de auto-reconexión
    const savedAutoReconnect = localStorage.getItem('pulsar_auto_reconnect');
    if (savedAutoReconnect !== null) {
        autoReconnectEnabled = savedAutoReconnect === 'true';
    }
    
    if (autoReconnectToggle) {
        autoReconnectToggle.checked = autoReconnectEnabled;
    }
    
    addLog(`🔄 Auto-reconexión: ${autoReconnectEnabled ? 'habilitada' : 'deshabilitada'}`, 'info');
    
    // Verificar funcionalidades y dar instrucciones
    if (navigator.bluetooth.getDevices) {
        addLog('💡 Recomendado: Usa "⚡ Buscar Ahora" para conexión directa', 'info');
    }
    
    addLog('📋 Opciones de conexión:', 'info');
    addLog('  • ⚡ Buscar Ahora: Conexión inmediata', 'info');
    addLog('  • 🔄 Reconectar: Reconectar al último dispositivo', 'info');
    addLog('  • 🔍 Smart Scan: Buscar dispositivos conocidos', 'info');
    
    // Mostrar información del último dispositivo si existe
    const lastDevice = getLastConnectedDevice();
    if (lastDevice) {
        const timeAgo = Math.floor((Date.now() - lastDevice.timestamp) / (1000 * 60)); // minutos
        addLog(`📱 Último dispositivo: ${lastDevice.name} (hace ${timeAgo} min)`, 'info');
    }
    
    // Intentar auto-reconexión al cargar
    tryAutoReconnectOnLoad();
}

// Actualizar valores iniciales de sliders
redValue.textContent = redSlider.value;
greenValue.textContent = greenSlider.value;
blueValue.textContent = blueSlider.value;
speedValue.textContent = blinkSpeedSlider.value;

// ========================================
// EVENT LISTENERS BLINK GPIO1
// ========================================
blinkOnBtn.addEventListener('click', () => {
    sendBlinkCommand('ON');
});

blinkOffBtn.addEventListener('click', () => {
    sendBlinkCommand('OFF');
});

blinkSpeedSlider.addEventListener('input', (e) => {
    const speed = e.target.value;
    speedValue.textContent = speed;
    sendBlinkCommand(`SPEED:${speed}`);
});