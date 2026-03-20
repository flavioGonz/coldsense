# 🛰️ Protocolo de Comunicación Firmware (v3.5 Pulsar)
**Para: Mauri**  
**Fecha:** 20 de Marzo, 2026  
**Ecosistema:** ColdSense Industrial IoT

---

## 1. Topología de Red y MQTT
El equipo debe conectarse al Broker MQTT configurado. El `client_id` de MQTT debe ser el MAC del equipo (ej: `42A2DC`) o el ID completo (`CS-42A2DC`).

### 📂 Estructura de Tópicos (Mauri Protocol)

| Fase | Tópico | Dirección | Propósito |
| :--- | :--- | :--- | :--- |
| **Descubrimiento** | `coldsense/pending/{ID}` | Out | Reportar presencia al encender (Discovery). |
| **Configuración** | `coldsense/config/{ID}` | In | Recibir parámetros (temp_min, temp_max, etc). |
| **Comando Global** | `coldsense/cmd/{ID}` | In | Órdenes administrativas (reboot, adopt, etc). |
| **Comando SaaS** | `clients/{CLIENT_ID}/sensors/{ID}/cmd` | In | Órdenes específicas de la empresa asignada. |
| **Telemetría** | `coldsense/data/{ID}` | Out | Envío de variables (T°, Humedad, Puerta). |
| **Estado** | `coldsense/status/{ID}` | Out | Heartbeat (online/offline) con flag de Retain. |
| **ACK** | `coldsense/ack/{ID}` | Out | Confirmación de recepción/ejecución de comandos. |

---

## 2. Flujo de Provisión (Handshake)

1.  **Boot**: El ESP32 se conecta al WiFi y al Broker.
2.  **Discovery**: Publica en `coldsense/pending/{ID}` información básica (FW, Modelo, IP, RSSI).
3.  **Wait for Adopt**: El servidor responderá en `coldsense/cmd/{ID}` con `{"cmd": "adopt", "clientId": "XYZ"}`.
    *   El equipo debe **guardar en NVS/Flash** el `clientId` para saber a qué tópico SaaS suscribirse.
4.  **Wait for Config**: El servidor enviará en `coldsense/config/{ID}`:
    ```json
    {
      "device_name": "Cámara 01",
      "temp_min": -22.0,
      "temp_max": -18.0,
      "timestamp": "2026-03-20T..."
    }
    ```
5.  **ACK**: El equipo debe responder con un ACK a `coldsense/ack/{ID}` para cerrar el bucle.

---

## 3. Formato de Payloads (JSON)

### A. Reporte de Telemetría (`coldsense/data/{ID}`)
Debe enviarse cada 30-60 segundos o por cambio de estado (puerta).
```json
{
  "tIn": -18.5,       // Temperatura Interior (DS18B20)
  "tOut": 22.3,      // Temperatura Exterior (DHT/SHT)
  "hum": 45.2,       // Humedad Interior
  "door": true,      // true = Abierta, false = Cerrada
  "rssi": -65,       // Señal WiFi
  "uptime": 3600,    // Segundos desde el boot
  "alarm": false,    // true si se detecta intrusión o fallo sensor
  "fw": "3.5.0",     // Versión actual
  "ip": "10.0.x.x"   // IP local
}
```

### B. Confirmación de Comandos (`coldsense/ack/{ID}`)
Es **crítico** enviar el `cmdId` recibido para que el dashboard marque la orden como exitosa.
```json
{
  "cmdId": "CMD-1773978909438",
  "sensorId": "CS-42A2DC",
  "status": "success",
  "msg": "Confirmación de ejecución"
}
```

---

## 4. Diccionario de Comandos (`cmd`)

El firmware debe implementar un `switch/case` para los siguientes comandos:

1.  **`reboot`**: Ejecutar `ESP.restart()`.
2.  **`open_door`**: Activar el GPIO configurado para el relé/solenoide.
3.  **`ota_update`**:
    *   Recibirá una `url` (http) y una `version`.
    *   El firmware debe descargar el binario y aplicarlo de forma autónoma.
4.  **`config`**: Actualizar los límites de temperatura en la lógica local de alarmas.

---

## 5. Recomendaciones Técnicas (Best Practices)

1.  **MQTT LWT (Last Will and Testament)**:
    *   Tópico: `coldsense/status/{ID}`
    *   Payload: `{"online": false}`
    *   Retain: `true`
2.  **Alarma Local**:
    *   Si `tIn > temp_max` por más de 5 minutos, activar buzzer local y enviar JSON con `alarm: true`.
3.  **Persistencia**:
    *   Guardar el `clientId` y los límites de temperatura en `Preferences.h` para que sobrevivan a un reinicio.
4.  **Suscripción Dual**:
    *   El equipo **DEBE** suscribirse a dos tópicos de comando simultáneamente:
        1. `coldsense/cmd/{ID}` (Global)
        2. `clients/{CLIENT_ID}/sensors/{ID}/cmd` (Específico SaaS)
