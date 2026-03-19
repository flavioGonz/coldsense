# ColdSense — Protocolo de comunicación MQTT

**Firmware:** v3.2 | **Hardware:** Pulsar ESP32-C6 | **Broker:** iot.infratec.com.uy

---

## 1. Descripción general

El dispositivo ColdSense monitorea cámaras frigoríficas en tiempo real. Cada unidad mide:

- Temperatura interior de la cámara (sensor DS18B20 sumergible)
- Temperatura y humedad exterior / ambiente (sensor DHT11)
- Estado de apertura de la puerta (reed switch magnético)

Al encenderse por primera vez, el ESP32 levanta un Access Point WiFi llamado `ColdSense-XXXX`. El técnico se conecta, ingresa las credenciales WiFi y la IP del broker. Desde ese momento el dispositivo se conecta al broker y queda **pendiente de adopción**.

---

## 2. Hardware

| Componente | Modelo | GPIO | Mide |
|---|---|---|---|
| Microcontrolador | Pulsar ESP32-C6 | — | WiFi 6 + MQTT |
| Temp. interior | DS18B20 inox (1-Wire) | GPIO 4 | Temperatura cámara (-55 a +125 °C) |
| Temp. + humedad exterior | DHT11 | GPIO 5 | Temperatura y humedad ambiente |
| Sensor de puerta | Reed switch | GPIO 9 | Abierta / cerrada |
| Alarma local | Buzzer activo | GPIO 20 | Alerta sonora local |
| LED estado WiFi | LED verde externo | GPIO 10 | Indicador conexión WiFi |
| LED estado MQTT | LED azul externo | GPIO 11 | Indicador conexión servidor |

---

## 3. Broker MQTT

| Parámetro | Valor |
|---|---|
| Host | `iot.infratec.com.uy` |
| Puerto | `1883` |
| Protocolo | MQTT 3.1.1 |
| Autenticación | Anónima (sin usuario/contraseña) |
| Keep-alive | 60 segundos |
| QoS publicación | 0 (at most once) |
| QoS suscripción | 1 (at least once) |

---

## 4. Identificación del dispositivo

### Device ID

Cada dispositivo genera su ID único a partir de la dirección MAC completa:

```
MAC: A4:C1:38:F2:B1:D0  →  device_id: "A4C138F2B1D0"
```

El ID es **permanente** — no cambia con reinicios ni actualizaciones de firmware.

### Estados y comportamiento de LEDs

| Estado | Descripción | LED verde (WiFi) | LED azul (MQTT) |
|---|---|---|---|
| Sin config | Sin WiFi configurado, portal AP activo | Parpadeo lento 1 Hz | Apagado |
| Conectando | Intentando conectar al WiFi | Parpadeo rápido 5 Hz | Apagado |
| Pendiente | WiFi OK, broker conectado, sin adoptar | Fijo encendido | Doble parpadeo |
| Operativo | Adoptado, midiendo y reportando | Fijo encendido | Pulso breve c/reporte |
| Alarma | Condición de alarma activa | Fijo encendido | Parpadeo muy rápido |

---

## 5. Topics MQTT

```
ESP32 → Servidor   clients/unassigned/sensors/{MAC}/telemetry   (sin adoptar)
ESP32 → Servidor   clients/{client_id}/sensors/{MAC}/telemetry  (adoptado)
Servidor → ESP32   clients/+/sensors/{MAC}/config               (configuración)
Servidor → ESP32   clients/+/sensors/{MAC}/cmd                  (comandos)
```

> El ESP32 se suscribe con wildcard `+` en config y cmd para recibir mensajes independientemente del `client_id` asignado.

---

## 6. Mensajes publicados por el dispositivo

### 6.1 Heartbeat — dispositivo pendiente

**Topic:** `clients/unassigned/sensors/{MAC}/telemetry`  
**Frecuencia:** cada 15 segundos mientras no sea adoptado

```json
{
  "device_id":   "A4C138F2B1D0",
  "type":        "heartbeat",
  "fw":          "3.2.0",
  "model":       "ColdSense-C6",
  "ip":          "192.168.1.45",
  "rssi":        -58,
  "uptime_secs": 120,
  "adopted":     false
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `device_id` | string | MAC sin puntos. Identificador único permanente |
| `type` | string | Siempre `"heartbeat"` en este mensaje |
| `fw` | string | Versión del firmware |
| `model` | string | Modelo del dispositivo |
| `ip` | string | IP local del dispositivo en la red |
| `rssi` | integer | Intensidad de señal WiFi en dBm |
| `uptime_secs` | integer | Segundos desde el último reinicio |
| `adopted` | boolean | Siempre `false` en este topic |

---

### 6.2 Telemetría — dispositivo operativo

**Topic:** `clients/{client_id}/sensors/{MAC}/telemetry`  
**Frecuencia:** configurable desde el servidor (por defecto cada 10 segundos)

```json
{
  "device_id":        "A4C138F2B1D0",
  "fw":               "3.2.0",
  "type":             "telemetry",

  "temp_interior":    -19.5,
  "temp_interior_ok": true,

  "temp_exterior":    22.3,
  "hum_exterior":     65.0,
  "temp_exterior_ok": true,

  "door_open":        false,
  "door_open_mins":   0,
  "door_name":        "Puerta principal",

  "alarm":            false,
  "rssi":             -58,
  "uptime_secs":      3600,

  "cam_id":           "CAM-01",
  "local_id":         "SUC-CENTRO",
  "cam_name":         "Camara de Helados"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `device_id` | string | MAC sin puntos |
| `fw` | string | Versión firmware |
| `type` | string | Siempre `"telemetry"` |
| `temp_interior` | float (1 decimal) | Temperatura interior cámara en °C. DS18B20. Si falla: `-99.0` |
| `temp_interior_ok` | boolean | `true` si el sensor DS18B20 respondió correctamente |
| `temp_exterior` | float (1 decimal) | Temperatura exterior / ambiente en °C. DHT11. Si falla: `-99.0` |
| `hum_exterior` | float (1 decimal) | Humedad relativa exterior en %. Si falla: `-99.0` |
| `temp_exterior_ok` | boolean | `true` si el sensor DHT11 respondió correctamente |
| `door_open` | boolean | `true` si la puerta está abierta en este momento |
| `door_open_mins` | integer | Minutos que lleva abierta. `0` si está cerrada |
| `door_name` | string | Nombre de la puerta configurado desde el servidor |
| `alarm` | boolean | `true` si hay una alarma activa en este momento |
| `rssi` | integer | Señal WiFi en dBm. Rango típico: -40 (excelente) a -90 (muy débil) |
| `uptime_secs` | integer | Segundos desde el último reinicio |
| `cam_id` | string | ID de cámara asignado al adoptar. **Solo presente si adoptado** |
| `local_id` | string | ID de local/sucursal. **Solo presente si adoptado** |
| `cam_name` | string | Nombre descriptivo de la cámara. **Solo presente si adoptado** |

> **Importante:** cuando un sensor falla, el valor llega como `-99.0` y el campo `_ok` llega en `false`. El backend debe ignorar valores `-99` en cálculos de promedios e históricos.

---

### 6.3 Alarma

**Topic:** `clients/{client_id}/sensors/{MAC}/telemetry`  
Se publica **inmediatamente** al detectar una condición de alarma o al normalizarse.

```json
{
  "device_id":     "A4C138F2B1D0",
  "type":          "alarm",
  "alarm_type":    "TEMP_HIGH",
  "detail":        "Temp interior -14.2C sobre maximo -18.0C",
  "temp_interior": -14.2,
  "uptime_secs":   7200,
  "cam_id":        "CAM-01",
  "local_id":      "SUC-CENTRO"
}
```

| `alarm_type` | Descripción | Condición |
|---|---|---|
| `TEMP_LOW` | Temperatura bajo el mínimo | `temp_interior < temp_min` configurado |
| `TEMP_HIGH` | Temperatura sobre el máximo | `temp_interior > temp_max` configurado |
| `DOOR_OPEN` | Puerta abierta demasiado tiempo | `door_open_mins > door_max_mins` configurado |
| `RESTORED` | Condición normalizada | La alarma anterior dejó de existir |

---

### 6.4 Status online / offline (LWT)

**Topic:** `clients/{client_id}/sensors/{MAC}/telemetry`

El ESP32 configura un **Last Will Testament** en el broker. Si se desconecta abruptamente, el broker publica automáticamente el mensaje offline.

```json
{ "device_id": "A4C138F2B1D0", "type": "status", "online": false }
{ "device_id": "A4C138F2B1D0", "type": "status", "online": true  }
```

---

## 7. Mensajes que envía el servidor al dispositivo

### 7.1 Configuración (post-adopción)

**Topic:** `clients/{client_id}/sensors/{MAC}/config`  
**Publicar con `retain=true`** para que el dispositivo la reciba aunque se reconecte.

```json
{
  "client_id":       "HELADERIA-POLAR",
  "local_id":        "SUC-CENTRO",
  "cam_id":          "CAM-01",
  "device_name":     "Camara de Helados Artesanales",

  "temp_min":        -22.0,
  "temp_max":        -18.0,
  "temp_warn":       2.0,
  "hum_max":         75.0,

  "door_max_mins":   5,
  "delta_alarm":     30.0,
  "report_interval": 10,

  "buzzer_enabled":  true,
  "relay_enabled":   false,

  "door2_enabled":   false,
  "door3_enabled":   false,
  "door1_name":      "Puerta principal"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `client_id` | string | ID del cliente. Al recibirlo el ESP32 se **marca como adoptado** |
| `local_id` | string | ID del local o sucursal |
| `cam_id` | string | ID de la cámara frigorífica |
| `device_name` | string | Nombre descriptivo que aparece en el dashboard |
| `temp_min` | float | Temperatura mínima aceptable. Alarma `TEMP_LOW` si baja |
| `temp_max` | float | Temperatura máxima aceptable. Alarma `TEMP_HIGH` si sube |
| `temp_warn` | float | Margen previo al umbral para advertencia anticipada |
| `hum_max` | float | Humedad máxima exterior de referencia |
| `door_max_mins` | integer | Minutos máximos con puerta abierta antes de alarma `DOOR_OPEN` |
| `delta_alarm` | float | Diferencia máxima entre temperatura interior y exterior |
| `report_interval` | integer | Segundos entre reportes. Mínimo recomendado: 5 |
| `buzzer_enabled` | boolean | Habilita el buzzer local ante alarmas |
| `relay_enabled` | boolean | Habilita el relé ante alarmas (reservado en v1) |
| `door1_name` | string | Nombre descriptivo de la puerta |

---

### 7.2 Comandos remotos

**Topic:** `clients/{client_id}/sensors/{MAC}/cmd`

```json
{ "cmd": "reboot" }
```

| `cmd` | Descripción | Efecto |
|---|---|---|
| `reboot` | Reinicia el ESP32 | Se desconecta y reconecta al broker |
| `reset` | Factory reset: borra WiFi y config | Levanta AP `ColdSense-XXXX` |
| `ack_alarm` | Reconoce la alarma y apaga el buzzer | Publica telemetría con `alarm: false` |

---

## 8. Flujo de adopción

| Paso | Quién | Acción |
|---|---|---|
| 1 | Técnico | Se conecta al AP `ColdSense-XXXX` (clave: `coldsense123`) y configura WiFi + broker |
| 2 | ESP32 | Publica heartbeat en `clients/unassigned/sensors/{MAC}/telemetry` cada 15s |
| 3 | Servidor | Detecta el `device_id` nuevo, lo guarda con estado `pending` |
| 4 | Operador | Entra al dashboard, va a Pendientes, adopta el dispositivo |
| 5 | Servidor | Publica config en `clients/{client_id}/sensors/{MAC}/config` con `retain=true` |
| 6 | ESP32 | Recibe config, guarda en NVS, cambia topic a `clients/{client_id}/...` |
| 7 | Servidor | Todos los mensajes llegan al topic del cliente correspondiente |

---

## 9. Referencia rápida — todos los campos posibles

| Campo | Presente en | Tipo | Ejemplo |
|---|---|---|---|
| `device_id` | Siempre | string | `"A4C138F2B1D0"` |
| `type` | Siempre | string | `"telemetry"` \| `"heartbeat"` \| `"alarm"` \| `"status"` |
| `fw` | telemetry, heartbeat | string | `"3.2.0"` |
| `temp_interior` | telemetry | float | `-19.5` |
| `temp_interior_ok` | telemetry | boolean | `true` |
| `temp_exterior` | telemetry | float | `22.3` |
| `hum_exterior` | telemetry | float | `65.0` |
| `temp_exterior_ok` | telemetry | boolean | `true` |
| `door_open` | telemetry | boolean | `false` |
| `door_open_mins` | telemetry | integer | `0` |
| `door_name` | telemetry | string | `"Puerta principal"` |
| `alarm` | telemetry | boolean | `false` |
| `alarm_type` | type=alarm | string | `"TEMP_HIGH"` |
| `detail` | type=alarm | string | `"Temp interior -14.2C..."` |
| `rssi` | telemetry, heartbeat | integer | `-58` |
| `uptime_secs` | telemetry, heartbeat | integer | `3600` |
| `cam_id` | si adoptado | string | `"CAM-01"` |
| `local_id` | si adoptado | string | `"SUC-CENTRO"` |
| `cam_name` | si adoptado | string | `"Camara de Helados"` |
| `online` | type=status | boolean | `true` \| `false` |

---

## 10. Consideraciones de implementación

**Retención de mensajes:** publicar el config con `retain=true` garantiza que el ESP32 lo recibe automáticamente al reconectarse sin necesidad de re-adoptar.

**Sensores con error:** ignorar valores `-99.0` en cálculos. Si `temp_interior_ok` llega en `false` durante más de 3 intervalos consecutivos, generar alerta de sensor offline.

**Detección de dispositivo offline:** además del LWT, comparar el timestamp del último mensaje recibido contra el `report_interval` configurado. Sin telemetría en 3× el intervalo = dispositivo probablemente offline.

**Retención de histórico:** para cumplimiento regulatorio de cadena de frío alimentaria se recomienda retener mínimo 90 días de histórico de temperatura.

**Frecuencia de reportes:** mínimo 5 segundos para cámaras críticas, 30-60 segundos para monitoreo estándar.

---

*ColdSense v3.2 — Pulsar ESP32-C6 (UNIT Electronics)*
