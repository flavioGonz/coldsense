# ColdSense — Integración con el servidor SaaS

**Para:** Equipo de desarrollo backend  
**Firmware:** v3.2 | **Hardware:** Pulsar ESP32-C6

---

## Resumen ejecutivo

El dispositivo ColdSense arranca, se conecta al WiFi y al broker MQTT, y empieza a publicar mensajes de forma autónoma. El servidor solo necesita escuchar esos mensajes, registrar el dispositivo como "pendiente", y cuando el operador lo adopta desde el dashboard, enviarle un JSON de configuración. A partir de ese momento el dispositivo opera de forma completamente autónoma.

---

## 1. Qué hace el dispositivo solo (sin intervención del servidor)

Cuando el técnico instala el equipo en campo:

1. Enciende el ESP32
2. Se conecta al AP `ColdSense-XXXX` desde el celular
3. Ingresa el SSID + contraseña WiFi y la IP/dominio del broker
4. El ESP32 se reinicia y se conecta al broker automáticamente

A partir de ese momento **el dispositivo hace todo solo**:

- Genera su ID único a partir de la MAC: `A4C138F2B1D0`
- Se conecta al broker `iot.infratec.com.uy:1883`
- Empieza a publicar en `clients/unassigned/sensors/{MAC}/telemetry` cada 15 segundos
- Se suscribe a `clients/+/sensors/{MAC}/config` esperando configuración
- Se suscribe a `clients/+/sensors/{MAC}/cmd` esperando comandos

El servidor no necesita hacer nada para que el dispositivo aparezca. Solo tiene que estar escuchando.

---

## 2. Cómo el servidor detecta un dispositivo nuevo

El servidor debe suscribirse al topic:

```
clients/unassigned/sensors/+/telemetry
```

Cuando llega un mensaje en ese topic, el payload tiene este formato:

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

El campo `type: "heartbeat"` indica que es un dispositivo sin adoptar. El servidor debe:

1. Extraer el `device_id` del payload (o del topic — es el penúltimo segmento)
2. Verificar si ya existe en la base de datos
3. Si no existe → crear registro con estado `pending`
4. Si ya existe → actualizar `last_seen`, `ip`, `rssi`, `fw_version`

El dispositivo repite este heartbeat cada **15 segundos** mientras no sea adoptado.

---

## 3. El proceso de adopción

La adopción ocurre cuando el operador entra al dashboard, ve el dispositivo en la lista de pendientes, y lo asigna a un cliente y local.

**Lo que hace el servidor al adoptar:**

Publicar en el broker con `retain=true`:

```
Topic:  clients/{client_id}/sensors/{MAC}/config
```

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
  "door1_name":      "Puerta principal"
}
```

> **Importante: usar `retain=true`**  
> Esto garantiza que si el dispositivo se reinicia o pierde conexión momentáneamente, al reconectarse recibe la configuración automáticamente sin necesidad de re-adoptar.

---

## 4. Qué pasa en el ESP32 al recibir la config

Cuando el ESP32 recibe el mensaje en `clients/+/sensors/{MAC}/config`:

1. Parsea el JSON
2. Guarda todos los valores en memoria no volátil (NVS — persiste reinicios)
3. Detecta que llegó `client_id` → se marca como **adoptado**
4. Actualiza el topic de telemetría de `unassigned` al `client_id` recibido
5. Cambia al estado **OPERATIVO**
6. Empieza a publicar en `clients/HELADERIA-POLAR/sensors/A4C138F2B1D0/telemetry`

El cambio es inmediato — el próximo mensaje ya va al topic correcto.

---

## 5. Mensajes en estado operativo

Una vez adoptado, el dispositivo publica telemetría cada `report_interval` segundos (por defecto 10s):

```
Topic: clients/{client_id}/sensors/{MAC}/telemetry
```

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
  "cam_name":         "Camara de Helados Artesanales"
}
```

El servidor debe suscribirse a:

```
clients/+/sensors/+/telemetry
```

Así recibe los mensajes de todos los dispositivos de todos los clientes en un solo topic con wildcards.

---

## 6. Alarmas

Cuando el dispositivo detecta una condición de alarma (temperatura fuera de rango o puerta abierta demasiado tiempo), publica **inmediatamente** en el mismo topic de telemetría con `type: "alarm"`:

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

Cuando la condición se normaliza, publica:

```json
{
  "device_id":  "A4C138F2B1D0",
  "type":       "alarm",
  "alarm_type": "RESTORED",
  "detail":     "Condicion normalizada"
}
```

| `alarm_type` | Cuándo se dispara |
|---|---|
| `TEMP_LOW` | `temp_interior < temp_min` configurado |
| `TEMP_HIGH` | `temp_interior > temp_max` configurado |
| `DOOR_OPEN` | Puerta abierta más de `door_max_mins` minutos |
| `RESTORED` | La condición de alarma dejó de existir |

> El buzzer local se activa automáticamente en el dispositivo sin necesidad de que el servidor haga nada. El servidor recibe la alarma para notificar al operador (WhatsApp, email, etc.)

---

## 7. Online / Offline (Last Will Testament)

El ESP32 configura un **LWT** en el broker al conectarse. Si pierde conexión abruptamente (corte de luz, caída de WiFi), el broker publica automáticamente:

```json
{ "device_id": "A4C138F2B1D0", "type": "status", "online": false }
```

Cuando se reconecta, publica:

```json
{ "device_id": "A4C138F2B1D0", "type": "status", "online": true, "fw": "3.2.0" }
```

Ambos van al mismo topic de telemetría del dispositivo.

---

## 8. Comandos que puede enviar el servidor

El servidor puede enviar comandos en cualquier momento:

```
Topic: clients/{client_id}/sensors/{MAC}/cmd
```

```json
{ "cmd": "reboot" }
```

| Comando | Efecto |
|---|---|
| `reboot` | Reinicia el ESP32. Útil tras actualización de config |
| `reset` | Factory reset completo. Borra WiFi y config, vuelve a modo AP |
| `ack_alarm` | Reconoce la alarma activa y apaga el buzzer local |

---

## 9. Diagrama completo del flujo

```
INSTALACIÓN EN CAMPO
─────────────────────────────────────────────────────────────
Técnico conecta ESP32 al WiFi del local (portal web 192.168.4.1)
                    │
                    ▼
ESP32 publica cada 15s:
clients/unassigned/sensors/A4C138F2B1D0/telemetry
{ type: "heartbeat", fw: "3.2.0", ip: "...", adopted: false }
                    │
                    ▼
SERVIDOR detecta device_id nuevo → guarda como "pending"


ADOPCIÓN DESDE DASHBOARD
─────────────────────────────────────────────────────────────
Operador asigna dispositivo a cliente + local + cámara
                    │
                    ▼
SERVIDOR publica (retain=true):
clients/HELADERIA-POLAR/sensors/A4C138F2B1D0/config
{ client_id: "HELADERIA-POLAR", temp_min: -22, temp_max: -18, ... }
                    │
                    ▼
ESP32 recibe config → se marca adoptado → cambia topic


OPERACIÓN NORMAL
─────────────────────────────────────────────────────────────
ESP32 publica cada 10s:
clients/HELADERIA-POLAR/sensors/A4C138F2B1D0/telemetry
{ type: "telemetry", temp_interior: -19.5, door_open: false, ... }
                    │
                    ▼
SERVIDOR recibe → guarda historial → actualiza dashboard


ALARMA
─────────────────────────────────────────────────────────────
Temperatura sube a -14°C (sobre el máximo de -18°C)
                    │
                    ├─► ESP32 activa buzzer local inmediatamente
                    │
                    ▼
ESP32 publica:
clients/HELADERIA-POLAR/sensors/A4C138F2B1D0/telemetry
{ type: "alarm", alarm_type: "TEMP_HIGH", detail: "...", temp_interior: -14.2 }
                    │
                    ▼
SERVIDOR recibe alarma → notifica operador (WhatsApp/email/push)
```

---

## 10. Resumen de topics para implementar en el servidor

| Acción | Topic | Dirección |
|---|---|---|
| Detectar dispositivos nuevos | `clients/unassigned/sensors/+/telemetry` | Suscribirse |
| Recibir telemetría de todos | `clients/+/sensors/+/telemetry` | Suscribirse |
| Enviar config al adoptar | `clients/{cid}/sensors/{MAC}/config` | Publicar (retain=true) |
| Enviar comandos | `clients/{cid}/sensors/{MAC}/cmd` | Publicar |

Con solo suscribirse a `clients/+/sensors/+/telemetry` el servidor recibe **todo** — heartbeats, telemetría, alarmas y status online/offline — diferenciados por el campo `type` en el JSON.

---

## 11. Identificación del tipo de mensaje

Todo llega al mismo topic. El campo `type` indica qué es:

| `type` | Qué significa | Cuándo llega |
|---|---|---|
| `heartbeat` | Dispositivo sin adoptar, buscando ser registrado | Cada 15s antes de adopción, cada 60s después |
| `telemetry` | Datos normales de sensores | Cada `report_interval` segundos |
| `alarm` | Alarma activa o normalizada | Inmediatamente al cambiar estado |
| `status` | Online / offline | Al conectar y al perder conexión (LWT) |

---

*ColdSense v3.2 — Pulsar ESP32-C6 (UNIT Electronics)*
