# Guía de Instalación: ColdSense Pro Firmware v3.2

Este firmware ha sido diseñado específicamente para el hardware **Pulsar ESP32-C6 (UNIT Electronics)** y es compatible con el protocolo SaaS 3.2.

## 🚀 Requisitos en Arduino IDE

Para compilar este código, asegúrate de tener instaladas las siguientes librerías desde el **Library Manager**:

1.  **WiFiManager** (by tablatronix) — *Opcional dependiendo de la versión base, yo implementé una versión ligera integrada.*
2.  **PubSubClient** (by Nick O'Leary) — Para MQTT.
3.  **ArduinoJson** (by Benoit Blanchon) — **Versión 6.x o superior**.
4.  **DallasTemperature** (by Miles Burton) — Para el sensor DS18B20.
5.  **OneWire** (by Paul Stoffregen).

## 🛠️ Configuración de la Placa (Pulsar C6)

En el menú **Tools** de Arduino IDE selecciona:
*   **Board:** ESP32C6 Dev Module
*   **Flash Mode:** QIO
*   **Flash Frequency:** 80MHz
*   **Partition Scheme:** Minimal SPIFFS (1.9MB APP con OTA)

## 📡 Flujo de Funcionamiento

1.  **Hotspot de Configuración**: Si el equipo no tiene WiFi configurado, verás una red llamada `ColdSense_Panel_{MAC}`. Conéctate con la clave `cold1234`.
2.  **Portal Web**: Entra a `192.168.4.1` desde tu celular para configurar el WiFi del local y la IP del servidor.
3.  **Adopción Automática**: Una vez conectado, el equipo enviará un `heartbeat` al servidor SaaS. En cuanto el usuario lo adopte desde la web, el ESP32 recibirá su configuración (Nombre, Local, Umbrales) y se guardará permanentemente en la memoria NVS.

## 📌 Asignación de Pines

*   **Pines de Sensores**:
    *   Temp (DS18B20): **GPIO 4**
    *   Door (Contacto): **GPIO 5**
*   **Indicadores y Alerta**:
    *   LED Verde (OK): **GPIO 14**
    *   LED Rojo (Alerta): **GPIO 15**
    *   Buzzer: **GPIO 11**
*   **Voltaje**:
    *   ADC Batería: **GPIO 0**

---
*Desarrollado por Antigravity AI para ColdSense SaaS Platform.*
