# TouchDot S3 - Control Bluetooth Web

**Interfaz web independiente** para controlar el TouchDot S3 a través de Bluetooth Low Energy (BLE) usando la Web Bluetooth API.

Este proyecto es una aplicación web completa y standalone que permite la interacción total con el dispositivo TouchDot S3 sin necesidad de aplicaciones móviles o software adicional.

## Características

### 🔗 Conectividad
- Conexión automática via Bluetooth LE
- Detección automática de desconexión
- Estado de conexión en tiempo real
- Log de actividad detallado

### 💡 Control de Hardware
- **LED integrado**: Encender/apagar remotamente
- **Sensores**: Lectura de temperatura y humedad 
- **Touch sensor**: Notificaciones en tiempo real
- Actualización automática cada 10 segundos

### 📱 Interfaz de Usuario
- Diseño responsivo con Tailwind CSS
- Indicadores visuales de estado
- Log de actividad con timestamps
- Interfaz intuitiva y moderna

## Requisitos del Navegador

La Web Bluetooth API requiere:
- **Chrome/Edge**: Versión 56+
- **Opera**: Versión 43+
- **Android Chrome**: Versión 56+

**Nota**: Firefox y Safari no soportan Web Bluetooth actualmente.

## Configuración del TouchDot S3

Para usar esta interfaz, el TouchDot S3 debe tener firmware que implemente:

### Servicio BLE Principal
```
UUID: 12345678-1234-1234-1234-1234567890ab
```

### Características BLE

1. **Control LED**
   - UUID: `12345678-1234-1234-1234-1234567890ac`
   - Tipo: Write
   - Formato: `'1'` (encender) / `'0'` (apagar)

2. **Lectura de Sensores**
   - UUID: `12345678-1234-1234-1234-1234567890ad`
   - Tipo: Read
   - Formato: `"temp:25.5,hum:60.2"`

3. **Sensor Touch**
   - UUID: `12345678-1234-1234-1234-1234567890ae`
   - Tipo: Notify
   - Formato: `'1'` (tocado) / `'0'` (libre)

## Código de Ejemplo para ESP32

```cpp
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// UUIDs
#define SERVICE_UUID           "12345678-1234-1234-1234-1234567890ab"
#define LED_CHARACTERISTIC_UUID "12345678-1234-1234-1234-1234567890ac"
#define SENSOR_CHARACTERISTIC_UUID "12345678-1234-1234-1234-1234567890ad"
#define TOUCH_CHARACTERISTIC_UUID "12345678-1234-1234-1234-1234567890ae"

BLEServer* pServer = NULL;
BLECharacteristic* pLedCharacteristic = NULL;
BLECharacteristic* pSensorCharacteristic = NULL;
BLECharacteristic* pTouchCharacteristic = NULL;

void setup() {
  // Inicializar BLE
  BLEDevice::init("TouchDot_S3");
  pServer = BLEDevice::createServer();
  
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  // Característica LED
  pLedCharacteristic = pService->createCharacteristic(
                      LED_CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_WRITE
                    );
  
  // Característica Sensores
  pSensorCharacteristic = pService->createCharacteristic(
                         SENSOR_CHARACTERISTIC_UUID,
                         BLECharacteristic::PROPERTY_READ
                       );
  
  // Característica Touch
  pTouchCharacteristic = pService->createCharacteristic(
                        TOUCH_CHARACTERISTIC_UUID,
                        BLECharacteristic::PROPERTY_NOTIFY
                      );
  
  pService->start();
  pServer->getAdvertising()->start();
}
```

## Uso

1. **Conexión**: 
   - Haz clic en "Conectar Bluetooth"
   - Selecciona tu TouchDot S3 de la lista
   - Espera la confirmación de conexión

2. **Control LED**:
   - Usa los botones "Encender/Apagar"
   - El indicador visual mostrará el estado

3. **Sensores**:
   - Haz clic en "Leer Sensores" para actualización manual
   - Los datos se actualizan automáticamente cada 10 segundos

4. **Touch Sensor**:
   - Las notificaciones aparecen automáticamente
   - No requiere acción manual

## Solución de Problemas

### Dispositivo no encontrado
- Verifica que el TouchDot S3 esté encendido
- Asegúrate que el Bluetooth esté habilitado
- Revisa que el nombre del dispositivo coincida

### Error de conexión
- Recarga la página web
- Reinicia el TouchDot S3
- Verifica la distancia (máximo 10 metros)

### Características no disponibles
- Confirma que el firmware implemente todas las características
- Revisa los UUIDs en el código del ESP32
- Verifica los permisos de las características

## Desarrollo

### Estructura de archivos
```
docs/bluetooth/
├── index.html          # Interfaz principal
├── script.js           # Lógica Bluetooth
└── README.md          # Esta documentación
```

### Personalización
- Modifica los UUIDs en `script.js` según tu implementación
- Ajusta los intervalos de actualización en la línea 264
- Personaliza la UI editando las clases CSS en `index.html`

## Contribuir

Para contribuir a este proyecto:
1. Fork el repositorio
2. Crea una rama para tu feature
3. Realiza tus cambios
4. Envía un Pull Request

## Licencia

Este proyecto está bajo la misma licencia que el repositorio principal UNIT Electronics.