/**
 * PULSAR H2 - Bluetooth Web Control Firmware
 * 
 * Firmware para ESP32 Pulsar H2 que integra:
 * - Control Bluetooth Low Energy
 * - NeoPixel RGB
 * - OLED SSD1306
 * - microSD SPI
 * - ADC GPIO2/GPIO3
 * - GPIO9 entrada
 * 
 * Desarrollado por UNIT Electronics
 * Compatible con Pulsar H2
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <SPI.h>
#include <SD.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_NeoPixel.h>

// ========================================
// CONFIGURACIÓN HARDWARE PULSAR H2
// ========================================
// ---------- NeoPixel ----------
#define RGB_LED_PIN 8
#define NUM_LEDS 1
Adafruit_NeoPixel strip(NUM_LEDS, RGB_LED_PIN, NEO_GRB + NEO_KHZ800);

// ---------- OLED ----------
#define OLED_RESET  -1
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define SDA_PIN 12
#define SCL_PIN 22
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ---------- GPIO entrada ----------
#define INPUT_PIN 9

// ---------- SPI + SD ----------
#define MOSI_PIN 5
#define MISO_PIN 0
#define SCK_PIN  4
#define CS_PIN   11
File myFile;

// ---------- ADC ----------
const int adcPin_A2 = 2; // GPIO2 (A2)
const int adcPin_A3 = 3; // GPIO3 (A3)

// ========================================
// UUIDs BLE - Deben coincidir con la web
// ========================================
#define SERVICE_UUID           "12345678-1234-1234-1234-1234567890ab"
#define NEOPIXEL_CHARACTERISTIC_UUID "12345678-1234-1234-1234-1234567890ac"
#define SENSOR_CHARACTERISTIC_UUID "12345678-1234-1234-1234-1234567890ad"
#define GPIO_CHARACTERISTIC_UUID "12345678-1234-1234-1234-1234567890ae"
#define SD_CHARACTERISTIC_UUID "12345678-1234-1234-1234-1234567890af"

// ========================================
// VARIABLES GLOBALES BLE
// ========================================
BLEServer* pServer = NULL;
BLECharacteristic* pNeopixelCharacteristic = NULL;
BLECharacteristic* pSensorCharacteristic = NULL;
BLECharacteristic* pGpioCharacteristic = NULL;
BLECharacteristic* pSdCharacteristic = NULL;

bool deviceConnected = false;
bool oldDeviceConnected = false;
int lastGpioState = -1;
unsigned long lastSensorRead = 0;
unsigned long lastDisplayUpdate = 0;
const unsigned long SENSOR_INTERVAL = 1000; // Leer sensores cada 1 segundo
const unsigned long DISPLAY_INTERVAL = 500; // Actualizar display cada 500ms
bool deviceInfoSent = false; // Flag para enviar Device Info solo una vez al conectar
// ========================================
// DECLARACIONES ADELANTADAS
// ========================================
// ========================================
// DECLARACIONES ADELANTADAS
// ========================================
void ledColor(uint8_t r, uint8_t g, uint8_t b); // ← NECESARIO
void handleSDCommand(std::string command);      // ← NUEVO


// Variables para el hardware
bool sdCardOK = false;
bool oledOK = false;
uint8_t currentR = 0, currentG = 0, currentB = 0;
unsigned long lastOledCheck = 0;
const unsigned long OLED_CHECK_INTERVAL = 5000; // Verificar OLED cada 5 segundos

// ========================================
// FORWARD DECLARATIONS
// ========================================
String getDeviceInfo();

// ========================================
// CALLBACKS BLE
// ========================================
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      deviceInfoSent = false; // Reset flag al conectar
      Serial.println("Cliente conectado");
      
      // *** ENVIAR ESTADO INICIAL AL CONECTAR ***
      delay(1500); // Dar más tiempo para que el cliente configure notificaciones
      
      // Enviar estado actual de GPIO9
      if (pGpioCharacteristic) {
        String currentGpioState = String(digitalRead(INPUT_PIN));
        pGpioCharacteristic->setValue(currentGpioState.c_str());
        pGpioCharacteristic->notify();
        Serial.printf("� Estado inicial GPIO9 enviado: %s\n", currentGpioState.c_str());
      }
      
      // Pequeña pausa antes de enviar Device Info
      delay(300);
      
      // Enviar información del dispositivo via característica Sensor
      if (pSensorCharacteristic) {
        String deviceInfo = getDeviceInfo();
        // Formato: DEVICE_INFO:{json}
        String infoMessage = "DEVICE_INFO:" + deviceInfo;
        pSensorCharacteristic->setValue(infoMessage.c_str());
        pSensorCharacteristic->notify();
        deviceInfoSent = true;
        Serial.println("� Información del dispositivo enviada:");
        Serial.println(deviceInfo);
      }
      
      // Pequeña pausa antes de enviar datos de sensores
      delay(500);
      
      // Enviar estado inicial de sensores
      if (pSensorCharacteristic) {
        int value_A2 = analogRead(adcPin_A2);
        int value_A3 = analogRead(adcPin_A3);
        float voltage_A2 = (value_A2 / 4095.0) * 3.3;
        float voltage_A3 = (value_A3 / 4095.0) * 3.3;
        
        String sensorData = "a2:" + String(voltage_A2, 3) + ",a3:" + String(voltage_A3, 3) + ",oled:" + (oledOK ? "OK" : "ERR");
        pSensorCharacteristic->setValue(sensorData.c_str());
        pSensorCharacteristic->notify();
        Serial.println("🔧 Estado inicial sensores enviado");
      }
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      deviceInfoSent = false; // Reset flag al desconectar
      Serial.println("Cliente desconectado");
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string rxValue = std::string(pCharacteristic->getValue().c_str());

      if (rxValue.length() > 0) {
        Serial.print("Comando BLE recibido: ");
        Serial.println(rxValue.c_str());
        
        // Control del NeoPixel
        if (pCharacteristic->getUUID().toString() == NEOPIXEL_CHARACTERISTIC_UUID) {
          // Formato: "r,g,b" ejemplo: "255,0,0" para rojo
          int r, g, b;
          if (sscanf(rxValue.c_str(), "%d,%d,%d", &r, &g, &b) == 3) {
            r = constrain(r, 0, 255);
            g = constrain(g, 0, 255);
            b = constrain(b, 0, 255);
            ledColor(r, g, b);
            currentR = r; currentG = g; currentB = b;
            Serial.printf("NeoPixel: R=%d G=%d B=%d\n", r, g, b);
          }
        }
        
        // Control de SD
        else if (pCharacteristic->getUUID().toString() == SD_CHARACTERISTIC_UUID) {
          if (sdCardOK) {
            handleSDCommand(rxValue);
          } else {
            pSdCharacteristic->setValue("ERROR:SD_NOT_AVAILABLE");
            pSdCharacteristic->notify();
          }
        }
      }
    }
};

// ========================================
// FUNCIONES AUXILIARES HARDWARE
// ========================================
void ledColor(uint8_t r, uint8_t g, uint8_t b) {
  strip.setPixelColor(0, strip.Color(r, g, b));
  strip.show();
}

// Función para obtener información del dispositivo
String getDeviceInfo() {
  // Obtener MAC Address (para ESP32-H2 usamos la MAC de la EFUSE)
  uint64_t efuseMac = ESP.getEfuseMac();
  char macStr[18];
  sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X",
          (uint8_t)(efuseMac >> 0), (uint8_t)(efuseMac >> 8),
          (uint8_t)(efuseMac >> 16), (uint8_t)(efuseMac >> 24),
          (uint8_t)(efuseMac >> 32), (uint8_t)(efuseMac >> 40));
  String macAddress = String(macStr);
  
  // Obtener Chip ID (único para cada ESP32)
  uint64_t chipID = ESP.getEfuseMac();
  
  // Convertir Chip ID a string hexadecimal
  char chipIDStr[17];
  sprintf(chipIDStr, "%04X%08X", (uint16_t)(chipID >> 32), (uint32_t)chipID);
  
  // Obtener información adicional
  String chipModel = ESP.getChipModel();
  uint8_t chipRevision = ESP.getChipRevision();
  uint32_t chipCores = ESP.getChipCores();
  uint32_t flashSize = ESP.getFlashChipSize();
  
  // Crear JSON con toda la información
  String deviceInfo = "{"
    "\"mac\":\"" + macAddress + "\","
    "\"chipID\":\"" + String(chipIDStr) + "\","
    "\"model\":\"" + chipModel + "\","
    "\"revision\":" + String(chipRevision) + ","
    "\"cores\":" + String(chipCores) + ","
    "\"flashSize\":" + String(flashSize) + ","
    "\"deviceName\":\"Pulsar_H2\","
    "\"firmware\":\"1.0.0\","
    "\"timestamp\":" + String(millis()) +
  "}";
  
  return deviceInfo;
}

// Función para verificar si la OLED está conectada
bool checkOLEDConnection() {
  Wire.beginTransmission(0x3C); // Dirección I2C de la OLED
  uint8_t error = Wire.endTransmission();
  
  if (error == 0) {
    // OLED responde correctamente
    return true;
  } else {
    // OLED no responde
    Serial.printf("⚠️ OLED no responde - Error I2C: %d\n", error);
    return false;
  }
}

// Función para intentar reconectar la OLED
bool reconnectOLED() {
  Serial.println("🔄 Intentando reconectar OLED...");
  
  // Reinicializar Wire
  Wire.end();
  delay(100);
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(100);
  
  // Intentar reinicializar la OLED
  if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("✅ OLED reconectada exitosamente");
    
    // Mostrar mensaje de reconexión
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("PULSAR H2 BLE");
    display.setCursor(0, 12);
    display.println("OLED Reconectada");
    display.setCursor(0, 24);
    display.print("Tiempo: ");
    display.print(millis() / 1000);
    display.println("s");
    display.display();
    
    return true;
  } else {
    Serial.println("❌ No se pudo reconectar la OLED");
    return false;
  }
}

// Función para diagnóstico del GPIO9
void diagnoseGPIO9() {
  Serial.println("\n🔍 === DIAGNÓSTICO GPIO9 ===");
  
  // Información de configuración
  Serial.printf("📌 Pin configurado: GPIO%d\n", INPUT_PIN);
  Serial.println("📌 Modo: INPUT_PULLUP");
  Serial.println("📌 Pull-up interno: ACTIVADO");
  
  // Lecturas múltiples para estabilidad
  Serial.println("📊 Realizando 10 lecturas consecutivas:");
  int highCount = 0, lowCount = 0;
  
  for (int i = 0; i < 10; i++) {
    int reading = digitalRead(INPUT_PIN);
    Serial.printf("   Lectura %2d: %d (%s)\n", i+1, reading, reading == HIGH ? "HIGH" : "LOW");
    
    if (reading == HIGH) highCount++;
    else lowCount++;
    
    delay(100);
  }
  
  // Análisis de estabilidad
  Serial.printf("📈 Resumen: %d lecturas HIGH, %d lecturas LOW\n", highCount, lowCount);
  
  if (highCount == 10) {
    Serial.println("✅ GPIO9 estable en HIGH (sin conexión a tierra)");
  } else if (lowCount == 10) {
    Serial.println("✅ GPIO9 estable en LOW (conectado a tierra)");
  } else {
    Serial.println("⚠️ GPIO9 presenta lecturas inconsistentes - posible ruido");
  }
  
  // Estado actual vs inicial
  int currentState = digitalRead(INPUT_PIN);
  Serial.printf("🎯 Estado actual: %s\n", currentState == HIGH ? "HIGH" : "LOW");
  Serial.printf("🎯 Estado inicial: %s\n", lastGpioState == HIGH ? "HIGH" : "LOW");
  
  if (currentState == lastGpioState) {
    Serial.println("✅ Estado consistente desde el inicio");
  } else {
    Serial.println("🔄 Estado cambió desde el inicio");
  }
  
  Serial.println("=== FIN DIAGNÓSTICO ===\n");
}

void listDir(fs::FS &fs, const char * dirname) {
  File root = fs.open(dirname);
  if (!root || !root.isDirectory()) return;
  File file = root.openNextFile();
  while (file) {
    Serial.print("  ");
    Serial.print(file.name());
    if (file.isDirectory()) Serial.println("/");
    else {
      Serial.print("\t");
      Serial.println(file.size());
    }
    file = root.openNextFile();
  }
}

// ========================================
// FUNCIONES DE GESTIÓN SD
// ========================================
String listSDFiles() {
  if (!sdCardOK) return "ERROR:SD_NOT_AVAILABLE";
  
  Serial.println("Iniciando listado de archivos SD...");
  
  String fileList = "FILES:";
  File root = SD.open("/");
  if (!root) {
    Serial.println("Error: No se pudo abrir directorio raíz");
    return "ERROR:CANNOT_READ_ROOT";
  }
  
  if (!root.isDirectory()) {
    Serial.println("Error: Raíz no es directorio");
    root.close();
    return "ERROR:CANNOT_READ_ROOT";
  }
  
  Serial.println("Directorio raíz abierto correctamente");
  
  int fileCount = 0;
  File file = root.openNextFile();
  while (file && fileCount < 5) {
    if (!file.isDirectory()) {
      String fileName = String(file.name());
      int fileSize = file.size();
      
      Serial.printf("Archivo encontrado: %s (%d bytes)\n", fileName.c_str(), fileSize);
      
      if (fileCount > 0) fileList += ",";
      fileList += fileName;
      fileList += "(";
      fileList += String(fileSize);
      fileList += "b)";
      fileCount++;
    }
    file.close(); // Cerrar archivo individual
    file = root.openNextFile();
  }
  
  root.close(); // Cerrar directorio raíz
  
  if (fileCount == 0) {
    fileList += "NO_FILES";
    Serial.println("No se encontraron archivos");
  } else {
    Serial.printf("Total archivos encontrados: %d\n", fileCount);
  }
  
  Serial.printf("Lista final: %s\n", fileList.c_str());
  return fileList;
}

bool writeSDFile(String filename, String content) {
  if (!sdCardOK) return false;
  
  File file = SD.open("/" + filename, FILE_WRITE);
  if (!file) return false;
  
  file.println("=== PULSAR H2 BLE FILE ===");
  file.print("Timestamp: ");
  file.println(millis());
  file.print("Content: ");
  file.println(content);
  file.println("=== END ===");
  file.close();
  
  Serial.println("Archivo escrito: " + filename);
  return true;
}

bool deleteSDFile(String filename) {
  if (!sdCardOK) return false;
  
  if (SD.exists("/" + filename)) {
    bool result = SD.remove("/" + filename);
    if (result) {
      Serial.println("Archivo borrado: " + filename);
    }
    return result;
  }
  return false;
}

// Variable global para almacenar la respuesta completa
String lastSDResponse = "";

void handleSDCommand(std::string command) {
  String cmd = String(command.c_str());
  cmd.trim();
  
  Serial.println("=== PROCESANDO COMANDO SD ===");
  Serial.println("Comando recibido: " + cmd);
  Serial.printf("Estado SD: %s\n", sdCardOK ? "OK" : "ERROR");
  
  if (cmd.startsWith("LIST")) {
    Serial.println("Ejecutando comando LIST...");
    String files = listSDFiles();
    Serial.println("Resultado: " + files);
    
    // Almacenar la respuesta completa para lectura directa
    lastSDResponse = files;
    
    if (pSdCharacteristic) {
      // Verificar tamaño del mensaje
      Serial.printf("Tamaño del mensaje: %d bytes\n", files.length());
      
      // Para LIST_SIMPLE, enviar directamente sin chunks
      if (cmd == "LIST_SIMPLE") {
        Serial.println("Modo LIST_SIMPLE: enviando directamente");
        pSdCharacteristic->setValue(files.c_str());
        pSdCharacteristic->notify();
        Serial.println("Respuesta LIST_SIMPLE enviada via BLE");
      }
      else if (files.length() > 100) {
        // Para compatibilidad con lectura directa, establecer la respuesta completa
        Serial.println("Configurando respuesta completa para lectura directa...");
        pSdCharacteristic->setValue(files.c_str());
        
        // También enviar chunks via notificaciones para navegadores que los soporten
        Serial.println("Enviando chunks via notificaciones...");
        
        // Enviar en fragmentos de máximo 80 caracteres
        int chunkSize = 80;
        int totalChunks = (files.length() + chunkSize - 1) / chunkSize; // Redondear hacia arriba
        
        for (int i = 0; i < totalChunks; i++) {
          String chunk;
          if (i == 0) {
            // Primer chunk incluye el prefijo CHUNK
            chunk = "CHUNK:" + String(i + 1) + "/" + String(totalChunks) + ":" + files.substring(i * chunkSize, min((i + 1) * chunkSize, (int)files.length()));
          } else {
            chunk = "CHUNK:" + String(i + 1) + "/" + String(totalChunks) + ":" + files.substring(i * chunkSize, min((i + 1) * chunkSize, (int)files.length()));
          }
          
          // Solo notificar, no cambiar el valor de la característica
          // pSdCharacteristic->setValue(chunk.c_str());
          pSdCharacteristic->notify();
          Serial.printf("Notificado chunk %d/%d: %s\n", i + 1, totalChunks, chunk.c_str());
          delay(100); // Reducir delay entre chunks
        }
      } else {
        // Mensaje pequeño, enviar normalmente
        pSdCharacteristic->setValue(files.c_str());
        pSdCharacteristic->notify();
        Serial.println("Respuesta enviada via BLE (mensaje pequeño)");
      }
    } else {
      Serial.println("ERROR: pSdCharacteristic es NULL");
    }
    
  } else if (cmd.startsWith("WRITE:")) {
    // Comando: WRITE:filename.txt:content
    int firstColon = cmd.indexOf(':', 6);
    if (firstColon != -1) {
      String filename = cmd.substring(6, firstColon);
      String content = cmd.substring(firstColon + 1);
      
      if (writeSDFile(filename, content)) {
        pSdCharacteristic->setValue(("WRITE_OK:" + filename).c_str());
      } else {
        pSdCharacteristic->setValue(("WRITE_ERROR:" + filename).c_str());
      }
      pSdCharacteristic->notify();
    }
    
  } else if (cmd.startsWith("DELETE:")) {
    // Comando: DELETE:filename.txt
    String filename = cmd.substring(7);
    
    if (deleteSDFile(filename)) {
      pSdCharacteristic->setValue(("DELETE_OK:" + filename).c_str());
    } else {
      pSdCharacteristic->setValue(("DELETE_ERROR:" + filename).c_str());
    }
    pSdCharacteristic->notify();
    
  } else {
    // Comando desconocido
    Serial.println("Comando SD desconocido: " + cmd);
    pSdCharacteristic->setValue("ERROR:UNKNOWN_COMMAND");
    pSdCharacteristic->notify();
  }
  
  Serial.println("=== FIN COMANDO SD ===");
}

// ========================================
// CONFIGURACIÓN INICIAL
// ========================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== UNIT ELECTRONICS PULSAR H2 BLUETOOTH CONTROL ===");

  // --- NeoPixel arranque ---
  strip.begin();
  ledColor(0, 0, 255); // Azul durante inicialización
  delay(500);

  // --- OLED init ---
  Wire.begin(SDA_PIN, SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("❌ OLED no detectado en inicio");
    oledOK = false;
    // No bloquear el sistema, continuar sin OLED
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("PULSAR H2 BLE");
    display.setCursor(0, 12);
    display.println("Iniciando...");
    display.display();
    Serial.println("✅ OLED OK");
    oledOK = true;
  }

  // --- SPI + microSD ---
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, CS_PIN);
  Serial.println("\nInicializando microSD...");
  if (!SD.begin(CS_PIN)) {
    Serial.println("❌ Error al inicializar microSD");
    sdCardOK = false;
  } else {
    Serial.println("✅ microSD OK");
    sdCardOK = true;
    
    // Crear archivo de log inicial
    myFile = SD.open("/bluetooth_log.txt", FILE_WRITE);
    if (myFile) {
      myFile.println("=== PULSAR H2 BLE LOG INICIADO ===");
      myFile.close();
    }
  }

  // --- Configurar GPIO9 ---
  pinMode(INPUT_PIN, INPUT_PULLUP);
  Serial.println("GPIO9 configurado (INPUT_PULLUP)");
  
  // *** LECTURA INICIAL DEL GPIO9 ***
  delay(100); // Pequeña pausa para estabilizar la lectura
  int initialGpioState = digitalRead(INPUT_PIN);
  lastGpioState = initialGpioState; // Establecer estado inicial
  
  Serial.print("🔍 Estado inicial GPIO9: ");
  Serial.println(initialGpioState == HIGH ? "HIGH" : "LOW");
  Serial.printf("🔍 Valor digital leído: %d\n", initialGpioState);
  
  // Validar configuración con múltiples lecturas
  Serial.println("🔍 Validando configuración GPIO9...");
  for (int i = 0; i < 5; i++) {
    int reading = digitalRead(INPUT_PIN);
    Serial.printf("   Lectura %d: %d (%s)\n", i+1, reading, reading == HIGH ? "HIGH" : "LOW");
    delay(50);
  }
  
  // Confirmar estado estable
  int finalReading = digitalRead(INPUT_PIN);
  if (finalReading == initialGpioState) {
    Serial.println("✅ GPIO9 configuración estable confirmada");
  } else {
    Serial.println("⚠️ GPIO9 presenta lecturas inconsistentes");
    lastGpioState = finalReading; // Usar la última lectura
  }
  
  Serial.printf("🎯 Estado inicial confirmado GPIO9: %s\n", 
                lastGpioState == HIGH ? "HIGH" : "LOW");

  // --- Configurar ADC ---
  analogReadResolution(12);
  Serial.println("ADC habilitado: A2(GPIO2) y A3(GPIO3)");

  // --- Configurar BLE ---
  setupBLE();
  
  // Realizar diagnóstico completo del GPIO9
  diagnoseGPIO9();
  
  // Indicar listo
  ledColor(0, 255, 0); // Verde = listo
  
  // Mostrar información de arranque en OLED
  if (oledOK) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("PULSAR H2 BLE");
    display.setCursor(0, 12);
    display.println("Listo para BLE");
    
    // Mostrar estado inicial de GPIO9
    display.setCursor(0, 24);
    display.print("GPIO9: ");
    display.println(lastGpioState == HIGH ? "HIGH" : "LOW");
    
    // Mostrar estados del sistema
    display.setCursor(0, 36);
    display.print("SD:");
    display.print(sdCardOK ? "OK" : "ERR");
    display.print(" OLED:");
    display.println(oledOK ? "OK" : "ERR");
    
    // Tiempo de inicialización
    display.setCursor(0, 48);
    display.print("Init: ");
    display.print(millis());
    display.println("ms");
    
    display.display();
  }
  
  Serial.println("Pulsar H2 listo para conexiones Bluetooth");
  Serial.println("Nombre del dispositivo: Pulsar_H2");
  
  // *** RESUMEN DEL ESTADO INICIAL ***
  Serial.println("\n🎯 === ESTADO INICIAL DEL SISTEMA ===");
  Serial.printf("🔧 GPIO9: %s (valor: %d)\n", lastGpioState == HIGH ? "HIGH" : "LOW", lastGpioState);
  Serial.printf("💾 MicroSD: %s\n", sdCardOK ? "OK" : "ERROR");
  Serial.printf("📺 OLED: %s\n", oledOK ? "OK" : "ERROR");
  Serial.printf("📡 BLE: INICIADO\n");
  Serial.printf("🎨 NeoPixel: RGB(0,255,0) - VERDE\n");
  Serial.printf("⏱️ Tiempo de inicialización: %lu ms\n", millis());
  Serial.println("=== SISTEMA LISTO ===\n");
}

// ========================================
// CONFIGURACIÓN BLE
// ========================================
void setupBLE() {
  // Crear dispositivo BLE
  BLEDevice::init("Pulsar_H2");
  
  // Crear servidor BLE
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Crear servicio BLE
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Crear característica para NeoPixel
  pNeopixelCharacteristic = pService->createCharacteristic(
                           NEOPIXEL_CHARACTERISTIC_UUID,
                           BLECharacteristic::PROPERTY_READ |
                           BLECharacteristic::PROPERTY_WRITE
                         );
  pNeopixelCharacteristic->setCallbacks(new MyCallbacks());

  // Crear característica para sensores (ADC + GPIO)
  pSensorCharacteristic = pService->createCharacteristic(
                         SENSOR_CHARACTERISTIC_UUID,
                         BLECharacteristic::PROPERTY_READ |
                         BLECharacteristic::PROPERTY_NOTIFY
                       );

  // Crear característica para GPIO
  pGpioCharacteristic = pService->createCharacteristic(
                       GPIO_CHARACTERISTIC_UUID,
                       BLECharacteristic::PROPERTY_READ |
                       BLECharacteristic::PROPERTY_NOTIFY
                     );

  // Crear característica para SD
  pSdCharacteristic = pService->createCharacteristic(
                     SD_CHARACTERISTIC_UUID,
                     BLECharacteristic::PROPERTY_READ |
                     BLECharacteristic::PROPERTY_WRITE |
                     BLECharacteristic::PROPERTY_NOTIFY
                   );
  pSdCharacteristic->setCallbacks(new MyCallbacks());

  // Agregar descriptores BLE2902 solo para las características críticas
  // ESP32-H2 tiene limitaciones: máximo 4 características activas
  // Priorizamos las notificaciones más importantes
  pSensorCharacteristic->addDescriptor(new BLE2902());  // Crítico: lecturas continuas + device info
  pGpioCharacteristic->addDescriptor(new BLE2902());    // Crítico: cambios de estado

  // Inicializar valores con estado real del GPIO9
  pNeopixelCharacteristic->setValue("0,255,0");
  pSensorCharacteristic->setValue("a2:0.0,a3:0.0");
  
  // Establecer el valor inicial real del GPIO9
  String initialGpioValue = String(lastGpioState);
  pGpioCharacteristic->setValue(initialGpioValue.c_str());
  Serial.printf("🔧 BLE GPIO característica inicializada con: %s\n", initialGpioValue.c_str());
  
  pSdCharacteristic->setValue(sdCardOK ? "OK" : "ERROR");
  
  Serial.println("🔧 Device Info se enviará via característica Sensor al conectar");

  // Iniciar servicio
  pService->start();

  // Iniciar advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();
  
  Serial.println("Servicio BLE iniciado, esperando conexiones...");
}

// ========================================
// LOOP PRINCIPAL
// ========================================
void loop() {
  // Manejar conexión/desconexión BLE
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Reiniciando advertising BLE");
    oldDeviceConnected = deviceConnected;
  }
  
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  // Leer sensores y GPIO
  int gpioState = digitalRead(INPUT_PIN);
  int value_A2 = analogRead(adcPin_A2);
  int value_A3 = analogRead(adcPin_A3);
  float voltage_A2 = (value_A2 / 4095.0) * 3.3;
  float voltage_A3 = (value_A3 / 4095.0) * 3.3;

  // Enviar datos via BLE si está conectado
  if (deviceConnected && millis() - lastSensorRead > SENSOR_INTERVAL) {
    // Si aún no se ha confirmado el envío de Device Info, reenviarlo cada 5 segundos
    static unsigned long lastDeviceInfoRetry = 0;
    if (!deviceInfoSent || (millis() - lastDeviceInfoRetry > 5000)) {
      String deviceInfo = getDeviceInfo();
      String infoMessage = "DEVICE_INFO:" + deviceInfo;
      pSensorCharacteristic->setValue(infoMessage.c_str());
      pSensorCharacteristic->notify();
      lastDeviceInfoRetry = millis();
      Serial.println("🔄 Reenviando Device Info...");
      delay(200); // Pausa para que se procese
    }
    
    // Enviar datos de sensores ADC + estado OLED
    String sensorData = "a2:" + String(voltage_A2, 3) + ",a3:" + String(voltage_A3, 3) + ",oled:" + (oledOK ? "OK" : "ERR");
    pSensorCharacteristic->setValue(sensorData.c_str());
    pSensorCharacteristic->notify();
    
    lastSensorRead = millis();
  }

  // Notificar cambios en GPIO9
  if (gpioState != lastGpioState) {
    lastGpioState = gpioState;
    String gpioData = String(gpioState);
    pGpioCharacteristic->setValue(gpioData.c_str());
    
    if (deviceConnected) {
      pGpioCharacteristic->notify();
    }
    
    Serial.println("GPIO9: " + String(gpioState == HIGH ? "HIGH" : "LOW"));
  }

  // Verificar conexión OLED periódicamente
  if (millis() - lastOledCheck > OLED_CHECK_INTERVAL) {
    bool currentOledStatus = checkOLEDConnection();
    
    if (oledOK && !currentOledStatus) {
      // OLED se desconectó
      Serial.println("🚨 OLED DESCONECTADA - Detectada desconexión");
      oledOK = false;
      
      // Indicar con NeoPixel (parpadeo rojo)
      for (int i = 0; i < 3; i++) {
        ledColor(255, 0, 0);
        delay(200);
        ledColor(0, 0, 0);
        delay(200);
      }
      ledColor(currentR, currentG, currentB); // Restaurar color
      
    } else if (!oledOK && currentOledStatus) {
      // OLED se reconectó
      Serial.println("🔌 OLED RECONECTADA - Detectada reconexión");
      if (reconnectOLED()) {
        oledOK = true;
        
        // Indicar con NeoPixel (parpadeo verde)
        for (int i = 0; i < 3; i++) {
          ledColor(0, 255, 0);
          delay(200);
          ledColor(0, 0, 0);
          delay(200);
        }
        ledColor(currentR, currentG, currentB); // Restaurar color
      }
    }
    
    lastOledCheck = millis();
  }

  // Actualizar display OLED solo si está conectada
  if (oledOK && millis() - lastDisplayUpdate > DISPLAY_INTERVAL) {
    updateDisplay(gpioState, voltage_A2, voltage_A3);
    lastDisplayUpdate = millis();
  }

  // Control visual del NeoPixel según estado
  if (!deviceConnected) {
    // Parpadeo azul si no está conectado
    static unsigned long lastBlink = 0;
    static bool blinkState = false;
    if (millis() - lastBlink > 1000) {
      blinkState = !blinkState;
      ledColor(0, 0, blinkState ? 255 : 0);
      lastBlink = millis();
    }
  }

  delay(50);
}

// ========================================
// FUNCIONES ESPECÍFICAS PULSAR H2
// ========================================
void updateDisplay(int gpioState, float voltage_A2, float voltage_A3) {
  if (!oledOK) return; // No actualizar si OLED no está disponible
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  
  // Título
  display.println("PULSAR H2 BLE");
  display.print("BLE: ");
  display.println(deviceConnected ? "CONECTADO" : "DESCONECT");
  
  // GPIO9
  display.setCursor(0, 16);
  display.print("GPIO9: ");
  display.println(gpioState == HIGH ? "HIGH" : "LOW");
  
  // ADC
  display.setCursor(0, 28);
  display.print("A2:");
  display.print(voltage_A2, 2);
  display.print("V A3:");
  display.print(voltage_A3, 2);
  display.println("V");
  
  // Estados del sistema
  display.setCursor(0, 40);
  display.print("SD:");
  display.print(sdCardOK ? "OK" : "ERR");
  display.print(" OLED:");
  display.println(oledOK ? "OK" : "ERR");
  
  // Tiempo de funcionamiento
  display.setCursor(0, 52);
  display.print("Tiempo: ");
  display.print(millis() / 1000);
  display.println("s");
  
  display.display();
}
