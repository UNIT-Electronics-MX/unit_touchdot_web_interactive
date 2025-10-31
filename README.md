# TouchDot S3 - Bluetooth Web Control

🔗 **Aplicación web independiente** para controlar el TouchDot S3 via Bluetooth Low Energy

Esta aplicación web permite controlar completamente tu dispositivo TouchDot S3 directamente desde el navegador usando la Web Bluetooth API, sin necesidad de aplicaciones móviles adicionales.

## ✨ Características Principales

- 🔵 **Conexión Bluetooth LE**: Conecta directamente desde el navegador
- 💡 **Control de LED**: Enciende/apaga el LED integrado remotamente  
- 🌡️ **Monitoreo de Sensores**: Temperatura y humedad en tiempo real
- 👆 **Sensor Touch**: Notificaciones instantáneas de contacto
- 📊 **Log en Tiempo Real**: Seguimiento completo de actividad
- 📱 **Diseño Responsivo**: Funciona en desktop, tablet y móvil

## 🚀 Inicio Rápido

1. **Abrir la aplicación**: [TouchDot S3 Bluetooth Control](./docs/bluetooth/index.html)
2. **Encender tu TouchDot S3** con firmware Bluetooth compatible
3. **Hacer clic en "Conectar Bluetooth"** en la interfaz web
4. **Seleccionar tu dispositivo** de la lista
5. **¡Comenzar a controlar!** 

## 🌐 Compatibilidad de Navegadores

| Navegador | Soporte | Versión Mínima |
|-----------|---------|----------------|
| Chrome    | ✅ Completo | 56+ |
| Edge      | ✅ Completo | 79+ |
| Opera     | ✅ Completo | 43+ |
| Firefox   | ❌ No soportado | - |
| Safari    | ❌ No soportado | - |

## 📱 Uso en Móviles

- **Android Chrome**: ✅ Soporte completo
- **iOS Safari**: ❌ No soportado (limitación de Apple)

## 🛠️ Desarrollo

```bash
# Clonar el repositorio
git clone https://github.com/UNIT-Electronics-MX/unit_touchdot_web_interactive.git

# Navegar al directorio
cd unit_touchdot_web_interactive

# Abrir en navegador
# Simplemente abre index.html en un navegador compatible
```

## 📁 Estructura del Proyecto

```
├── index.html                 # Página de entrada (redirección)
├── docs/
│   ├── bluetooth/
│   │   ├── index.html        # Aplicación principal
│   │   ├── script.js         # Lógica Bluetooth
│   │   └── README.md         # Documentación detallada
│   └── bluetooth-icon.svg    # Ícono Bluetooth
└── README.md                 # Este archivo
```

## 🔧 Configuración del TouchDot S3

Para usar esta aplicación, tu TouchDot S3 debe tener firmware que implemente:

- **Servicio BLE**: `12345678-1234-1234-1234-1234567890ab`
- **Control LED**: `12345678-1234-1234-1234-1234567890ac`
- **Sensores**: `12345678-1234-1234-1234-1234567890ad`  
- **Touch**: `12345678-1234-1234-1234-1234567890ae`

Ver [documentación completa](./docs/bluetooth/README.md) para detalles de implementación.

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🏢 UNIT Electronics

Desarrollado por [UNIT Electronics](https://unit-electronics.com) - Especialistas en desarrollo de hardware y software para IoT.

---

**¿Necesitas ayuda?** Abre un [issue](https://github.com/UNIT-Electronics-MX/unit_touchdot_web_interactive/issues) o contáctanos en [UNIT Electronics](https://unit-electronics.com)