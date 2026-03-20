# ColdSense — Protocolo MQTT

Documentación del protocolo de comunicación del firmware **ColdSense v3.4** (ESP32-C6).
Dirigida a desarrolladores que quieran integrar los datos en sistemas externos.

---

## Conexión al broker

| Parámetro | Valor por defecto |
|-----------|-------------------|
| Broker local | `10.0.100.2:1883` |
| Broker nube  | `iot.infratec.com.uy:1883` |
| Puerto | `1883` (sin TLS) |
| Protocolo | MQTT 3.1.1 |
| Autenticación | Sin usuario/contraseña (configurable) |

El firmware publica simultáneamente a ambos brokers. Para escuchar todos los dispositivos suscribirse al wildcard `coldsense/#`.

---

## Identificación del dispositivo

El `device_id` se genera a partir de los últimos 3 bytes de la MAC Wi-Fi:

```
CS-XXYYZZ
```

Ejemplo: `CS-A3F2B1`

---

## Topics publicados por el ESP32

### 1. `coldsense/pending/<device_id>`

**Cuándo:** cada 5 segundos mientras el dispositivo **no está adoptado** (no tiene configuración asignada).
**Retain:** no
**Uso:** descubrir dispositivos nuevos en la red.

```json
{
  "fw":    "3.4.0",
  "model": "ESP32-C6",
  "ip":    "192.168.1.45",
  "rssi":  -62
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `fw` | string | Versión del firmware |
| `model` | string | Modelo del hardware |
| `ip` | string | IP actual del dispositivo |
| `rssi` | integer | Señal Wi-Fi en dBm |

---

### 2. `coldsense/data/<device_id>`

**Cuándo:** cada N segundos según `report_interval` (por defecto 10 s) mientras el dispositivo **está adoptado**.
**Retain:** no
**Uso:** fuente principal de datos de sensores.

```json
{
  "fw":        "3.4.0",
  "ip":        "192.168.1.45",
  "rssi":      -62,
  "sensor_ok": true,
  "temp":      -19.5,
  "hum":       68.0,
  "temp_amb":  22.3,
  "alarm":     false,
  "doors": [
    {
      "name":      "Estado de Puerta",
      "open":      false,
      "open_mins": 0
    }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `fw` | string | Versión del firmware |
| `ip` | string | IP actual |
| `rssi` | integer | Señal Wi-Fi en dBm |
| `sensor_ok` | boolean | `true` si el DS18B20 responde correctamente |
| `temp` | float \| ausente | Temperatura interior en °C (DS18B20). Ausente si `sensor_ok = false` |
| `hum` | float \| ausente | Humedad relativa en % (DHT11). Ausente si lectura inválida |
| `temp_amb` | float \| ausente | Temperatura ambiente en °C (DHT11). Ausente si lectura inválida |
| `alarm` | boolean | `true` si la temperatura interior supera el umbral `temp_min - margen` o `temp_max + margen` |
| `doors` | array | Array con el estado de cada sensor de puerta |
| `doors[].name` | string | Nombre configurado de la puerta |
| `doors[].open` | boolean | `true` = abierta, `false` = cerrada |
| `doors[].open_mins` | integer | Minutos que lleva abierta (0 si cerrada) |

> **Nota de precisión:** `temp` y `temp_amb` se publican con 1 decimal. `hum` con 1 decimal redondeado a entero en pantalla.

---

### 3. `coldsense/alarm/<device_id>`

**Cuándo:** al detectar o resolver una condición de alarma (solo si `alarm_screen_enabled = true` en la configuración).
**Retain:** no
**Uso:** notificaciones en tiempo real.

#### Alarma de temperatura baja
```json
{
  "type":   "TEMP_LOW",
  "detail": "Temperatura baja",
  "temp":   -25.2
}
```

#### Alarma de temperatura alta
```json
{
  "type":   "TEMP_HIGH",
  "detail": "Temperatura alta",
  "temp":   -15.1
}
```

#### Alarma de puerta abierta
```json
{
  "type":   "DOOR_OPEN",
  "detail": "Estado de Puerta abierta 6 min",
  "temp":   null
}
```

> La alarma de puerta se publica cada ciclo mientras la puerta siga abierta más de `door_max_mins` minutos.

#### Restauración (temperatura volvió al rango)
```json
{
  "type": "RESTORED",
  "temp": -19.8
}
```

| Campo | Tipo | Valores posibles |
|-------|------|-----------------|
| `type` | string | `TEMP_LOW`, `TEMP_HIGH`, `DOOR_OPEN`, `RESTORED` |
| `detail` | string | Descripción legible del evento |
| `temp` | float \| null | Temperatura en el momento de la alarma |

---

### 4. `coldsense/status/<device_id>`

**Cuándo:** al conectar (online) y al desconectarse por LWT — Last Will Testament.
**Retain:** sí
**Uso:** detectar si el dispositivo está en línea.

#### Online
```json
{ "online": true }
```

#### Offline (LWT — publicado automáticamente por el broker al perder conexión)
```json
{ "online": false }
```

---

## Topics que escucha el ESP32

### 5. `coldsense/config/<device_id>`

**Publicado por:** el servidor / plataforma externa.
**Retain:** sí (el ESP32 recibe la config al reconectarse aunque el servidor esté apagado).
**Efecto:** los valores se aplican de inmediato y se persisten en flash NVS (sobreviven al corte de luz).

```json
{
  "client_id":            "Supermercado ABC",
  "local_id":             "Local Centro",
  "cam_id":               "CAM-01",
  "device_name":          "Cámara Pescado 1",
  "temp_min":             -22.0,
  "temp_max":             -18.0,
  "temp_warn":            2.0,
  "hum_max":              75.0,
  "door_max_mins":        5,
  "delta_alarm":          30.0,
  "report_interval":      10,
  "buzzer_enabled":       false,
  "alarm_screen_enabled": true,
  "relay_enabled":        false,
  "door2_enabled":        false,
  "door3_enabled":        false,
  "door1_name":           "Estado de Puerta",
  "door2_name":           "Puerta 2",
  "door3_name":           "Puerta 3"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `temp_min` | float | Temperatura mínima aceptable (°C) |
| `temp_max` | float | Temperatura máxima aceptable (°C) |
| `temp_warn` | float | Margen adicional antes de disparar alarma (°C) |
| `hum_max` | float | Humedad máxima aceptable (%) — solo referencia |
| `door_max_mins` | integer | Minutos de puerta abierta antes de enviar alarma |
| `report_interval` | integer | Segundos entre publicaciones de datos (mín: 5) |
| `buzzer_enabled` | boolean | Activa la chicharra local al superar umbrales |
| `alarm_screen_enabled` | boolean | Publica en `coldsense/alarm/...` al superar umbrales |

> Campos no reconocidos son ignorados. Se pueden enviar solo los campos que se quieran cambiar.

---

### 6. `coldsense/cmd/<device_id>`

**Publicado por:** el servidor / plataforma externa.
**Retain:** no.
**Efecto:** ejecuta un comando en el dispositivo.

```json
{ "cmd": "reboot" }
```

| Valor de `cmd` | Efecto |
|----------------|--------|
| `reboot` | Reinicia el ESP32 |
| `reset` | Borra configuración NVS y reinicia (vuelve a estado sin adoptar) |
| `ack_alarm` | Silencia la alarma de temperatura activa hasta la próxima detección |
| `test_buzzer` | Activa el buzzer durante 2 segundos para verificar funcionamiento |

---

## Indicadores LED del hardware

| LED | Estado | Significado |
|-----|--------|-------------|
| Verde | Parpadeo rápido (150 ms) | Conectando a Wi-Fi |
| Verde | Parpadeo lento (1 s) | Sin red |
| Verde | Fijo encendido | Operando normalmente |
| Verde | Flash breve apagado (250 ms) | Publicando dato |
| Azul | Apagado | Sin conexión MQTT |
| Azul | Fijo encendido | MQTT conectado |
| Azul | 1 destello | Publicación normal |
| Azul | 3 destellos | Alarma enviada o config recibida |

---

## Cableado de sensores

| Componente | GPIO | Nota |
|------------|------|------|
| DS18B20 (temp. interna) | GPIO 4 | Resistencia 4.7 kΩ entre DATA y VCC (3.3 V) |
| DHT11 (temp./hum. ambiente) | GPIO 5 | — |
| Sensor de puerta NC | GPIO 20 | Contacto normalmente cerrado, INPUT_PULLUP |
| LED verde | GPIO 18 | 330 Ω en serie |
| LED azul | GPIO 19 | 330 Ω en serie |
| Buzzer activo | GPIO 21 | — |

---

## Ejemplo de flujo completo

```
ESP32 ──► coldsense/pending/CS-A3F2B1   {"fw":"3.4.0","ip":"192.168.1.45","rssi":-62}
Servidor ──► coldsense/config/CS-A3F2B1  {"temp_min":-22,"temp_max":-18,...}  (retain)
ESP32 ──► coldsense/data/CS-A3F2B1       {"temp":-25.1,"hum":65.0,...,"alarm":true}
ESP32 ──► coldsense/alarm/CS-A3F2B1      {"type":"TEMP_LOW","detail":"Temperatura baja","temp":-25.1}
Servidor ──► coldsense/cmd/CS-A3F2B1     {"cmd":"ack_alarm"}
```

---

## Suscripción recomendada para integración

```
coldsense/data/#     → todos los datos de sensores
coldsense/alarm/#    → todas las alarmas en tiempo real
coldsense/status/#   → presencia online/offline
```

---

*Firmware: ColdSense v3.4.0 — Hardware: ESP32-C6 PULSAR (UNIT Electronics, Nano form factor)*
