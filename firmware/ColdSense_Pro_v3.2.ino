/*
 *  COLDSENSE PRO FIRMWARE v3.2
 *  Device: Pulsar ESP32-C6 (UNIT Electronics)
 *  Protocol: ColdSense MQTT v3.2 Compatible
 *  Author: Antigravity AI
 */

#include <WiFi.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// --- Hardware Hardware Config ---
const int PIN_ONEWIRE = 4;   // DS18B20 Temp
const int PIN_DOOR    = 5;   // Door Status
const int PIN_LED_OK  = 14;  // Green
const int PIN_LED_ERR = 15;  // Red
const int PIN_BUZZER  = 11;  // Alarm Buzzer
const int PIN_BATT    = 0;   // Battery Voltage Monitor (ADC)

// --- System State ---
String deviceID;      // MAC without dots
String fwVersion = "3.2.0";
String clientId  = "unassigned";
String localId   = "LOCAL-? ";
String camId     = "CAM-? ";
String deviceName = "Unknown ColdSense";
bool adopted     = false;

// --- Configs ---
char mqttServer[64] = "iot.infratec.com.uy";
int mqttPort        = 1883;
unsigned long lastTelemetry = 0;
unsigned long lastHeartbeat = 0;
int reportInterval  = 15000; // default 15s

// --- Objects ---
WiFiClient espClient;
PubSubClient mqtt(espClient);
WebServer server(80);
Preferences nvs;
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature sensors(&oneWire);

// --- 1. WIFI & AP DASHBOARD ---
void startAP() {
  String apName = "ColdSense_Panel_" + deviceID;
  WiFi.softAP(apName.c_str(), "cold1234");
  Serial.println("🌐 Hotspot Activado: " + apName);
  Serial.print("🌐 Configura en: "); Serial.println(WiFi.softAPIP());
}

void handleStatus() {
  float temp = readTemp();
  float vBat = (analogRead(PIN_BATT) * 3.3 / 4095.0) * 2.0; // Estimate
  int rssi = WiFi.RSSI();

  String html = "<html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<style>body{background:#0a0a0f; color:#fff; font-family:sans-serif; text-align:center; padding:2rem;}";
  html += ".card{background:#151520; border:1px solid #222; border-radius:15px; padding:2rem; max-width:400px; margin:auto; box-shadow:0 10px 30px rgba(0,0,0,0.5);}";
  html += ".value{font-size:2.5rem; color:#00f2fe; margin:1rem 0;} .label{color:#888; font-size:0.8rem; text-transform:uppercase;}</style>";
  html += "</head><body>";
  html += "<div class='card'><h1>ColdSense Pro v3.2</h1>";
  html += "<div class='label'>ID Dispositivo</div><div>" + deviceID + "</div>";
  html += "<div class='label'>Sensor Interior</div><div class='value'>" + String(temp, 1) + "°C</div>";
  html += "<hr style='border:0.5px solid #333;'>";
  html += "<div style='display:grid; grid-template-columns:1fr 1fr; gap:1rem;'>";
  html += "<div><div class='label'>Batería</div><div>" + String(vBat, 2) + "V</div></div>";
  html += "<div><div class='label'>Señal WiFi</div><div>" + String(rssi) + " dBm</div></div>";
  html += "</div>";
  html += "<div style='margin-top:2rem;'><div class='label'>Estado Adopción</div>";
  html += "<div style='color:" + String(adopted ? "#00ff88" : "#ff5500") + "'>" + (adopted ? "ADOPTADO ("+clientId+")" : "PENDIENTE") + "</div></div>";
  html += "<div style='margin-top:2rem;'><a href='/config' style='color:#00f2fe; text-decoration:none;'>⚙️ Configurar WiFi / Broker</a></div>";
  html += "</div></body></html>";
  server.send(200, "text/html", html);
}

void handleConfigPage() {
    String html = "<html><body style='background:#111; color:#fff; font-family:sans-serif; padding:2rem;'>";
    html += "<h2>Configuración de Sistema</h2>";
    html += "<form action='/save' method='POST'>";
    html += "SSID: <br><input type='text' name='ssid' style='width:100%; border:0; padding:10px; margin:5px 0;'><br>";
    html += "PASSWORD: <br><input type='password' name='pass' style='width:100%; border:0; padding:10px; margin:5px 0;'><br><br>";
    html += "MQTT BROKER: <br><input type='text' name='host' value='" + String(mqttServer) + "' style='width:100%; border:0; padding:10px; margin:5px 0;'><br>";
    html += "<input type='submit' value='Guardar y Reiniciar' style='background:#00f2fe; color:#000; border:0; padding:15px; width:100%; cursor:pointer;'>";
    html += "</form></body></html>";
    server.send(200, "text/html", html);
}

void handleSave() {
  String s = server.arg("ssid");
  String p = server.arg("pass");
  String h = server.arg("host");
  
  if (s != "") {
      nvs.putString("ssid", s);
      nvs.putString("pass", p);
      nvs.putString("host", h);
      server.send(200, "text/plain", "OK. El dispositivo se reiniciará para conectar...");
      delay(2000);
      ESP.restart();
  }
}

// --- 2. MQTT CORE ---
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<512> doc;
  deserializeJson(doc, payload, length);

  if (strstr(topic, "/config")) {
    Serial.println("⚙️ Nueva configuración recibida!");
    clientId = doc["client_id"].as<String>();
    localId  = doc["local_id"].as<String>();
    camId    = doc["cam_id"].as<String>();
    deviceName = doc["device_name"].as<String>();
    reportInterval = doc["report_interval"] | 15;
    adopted = true;

    nvs.putString("cid", clientId);
    nvs.putString("lid", localId);
    nvs.putString("camid", camId);
    nvs.putString("name", deviceName);
    nvs.putBool("got_config", true);
    
    digitalWrite(PIN_LED_OK, HIGH);
    delay(200);
    digitalWrite(PIN_LED_OK, LOW);
  } else if (strstr(topic, "/cmd")) {
    String cmd = doc["cmd"].as<String>();
    if (cmd == "reboot") ESP.restart();
    if (cmd == "reset") { nvs.clear(); ESP.restart(); }
    if (cmd == "ack_alarm") { digitalWrite(PIN_BUZZER, LOW); digitalWrite(PIN_LED_ERR, LOW); }
  }
}

void connectMQTT() {
  while (!mqtt.connected()) {
    String t_lwt = "clients/" + clientId + "/sensors/" + deviceID + "/telemetry";
    String lwt_msg = "{\"device_id\":\"" + deviceID + "\",\"type\":\"status\",\"online\":false}";
    
    if (mqtt.connect(deviceID.c_str(), NULL, NULL, t_lwt.c_str(), 1, true, lwt_msg.c_str())) {
       Serial.println("✅ Conectado al Broker SaaS");
       mqtt.subscribe(("clients/+/sensors/" + deviceID + "/config").c_str());
       mqtt.subscribe(("clients/+/sensors/" + deviceID + "/cmd").c_str());
       
       // Status Online
       String on_msg = "{\"device_id\":\"" + deviceID + "\",\"type\":\"status\",\"online\":true,\"fw\":\"" + fwVersion + "\"}";
       mqtt.publish(t_lwt.c_str(), on_msg.c_str());
    } else {
       Serial.print("❌ Falló: "); Serial.println(mqtt.state());
       delay(5000);
    }
  }
}

// --- 3. HARDWARE ---
float readTemp() {
  sensors.requestTemperatures();
  float t = sensors.getTempCByIndex(0);
  return (t == -127.0) ? -99.0 : t; // -99 means sensor missing
}

void reportTelemetry() {
  StaticJsonDocument<512> doc;
  doc["device_id"] = deviceID;
  doc["fw"] = fwVersion;
  doc["type"] = adopted ? "telemetry" : "heartbeat";
  
  float t_int = readTemp();
  doc["temp_interior"] = t_int;
  doc["temp_interior_ok"] = (t_int != -99.0);
  
  bool door = digitalRead(PIN_DOOR) == LOW; // Assuming NC switch
  doc["door_open"] = door;
  doc["rssi"] = WiFi.RSSI();
  doc["uptime_secs"] = millis() / 1000;
  doc["adopted"] = adopted;
  
  if (adopted) {
    doc["local_id"] = localId;
    doc["cam_id"] = camId;
    doc["cam_name"] = deviceName;
  }

  char buffer[512];
  serializeJson(doc, buffer);
  
  String topic = "clients/" + clientId + "/sensors/" + deviceID + "/telemetry";
  mqtt.publish(topic.c_str(), buffer);
  Serial.println("📡 Telemetría enviada a: " + topic);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_OK, OUTPUT); pinMode(PIN_LED_ERR, OUTPUT); pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_DOOR, INPUT_PULLUP);
  
  nvs.begin("coldsense", false);
  deviceID = WiFi.macAddress();
  deviceID.replace(":", "");
  
  // Load saved config
  clientId = nvs.getString("cid", "unassigned");
  localId  = nvs.getString("lid", "");
  camId    = nvs.getString("camid", "");
  deviceName = nvs.getString("name", "");
  adopted = nvs.getBool("got_config", false);

  String saved_ssid = nvs.getString("ssid", "");
  String saved_pass = nvs.getString("pass", "");
  
  if (saved_ssid != "") {
      WiFi.begin(saved_ssid.c_str(), saved_pass.c_str());
      int retries = 0;
      while (WiFi.status() != WL_CONNECTED && retries < 40) {
        delay(500); Serial.print("."); retries++;
        digitalWrite(PIN_LED_OK, !digitalRead(PIN_LED_OK));
      }
      digitalWrite(PIN_LED_OK, HIGH);
  }

  if (WiFi.status() != WL_CONNECTED) {
    startAP();
  } else {
    mqtt.setServer(mqttServer, mqttPort);
    mqtt.setCallback(mqttCallback);
  }

  server.on("/", handleStatus);
  server.on("/config", handleConfigPage);
  server.on("/save", handleSave);
  server.begin();
  sensors.begin();
}

void loop() {
  server.handleClient();

  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) connectMQTT();
    mqtt.loop();

    unsigned long now = millis();
    if (now - lastTelemetry > (adopted ? reportInterval : 15000)) {
       reportTelemetry();
       lastTelemetry = now;
    }
  } else {
    // LED blink error sequence...
  }
}
