# ❄️ Cold Sense: Enterprise IoT Thermal Monitoring & Control

**Cold Sense** is a state-of-the-art, full-stack SaaS platform designed for real-time monitoring of refrigeration chains, specialized for pharmaceutical and food logistics. Built with a focus on reliability, visual excellence, and hardware-software synergy.

![Cold Sense Dashboard Mockup](https://raw.githubusercontent.com/flavioGonz/coldsense/main/mockup.png)

## 🚀 Core Features

### 📡 Smart Hardware (Pulsar ESP32-C6)
- **Real-time Telemetry**: Monitoring of interior/exterior temperatures via DS18B20 sensors.
- **Door Security**: Detection of open/closed states with instant alerting.
- **OTA Updates**: Remote firmware management directly from the Admin console.
- **Local Control**: Execution of GPIO commands (reboot, door unlock) via MQTT.

### 🏢 Enterprise Portal (Client)
- **Dynamic Dashboard**: High-fidelity cards with real-time status highlights (Normal, Warning, Critical).
- **Analytical Graphing**: High-resolution temperature history powered by Chart.js.
- **Multi-branch Management**: Organize hardware by physical locations.
- **PWA Experience**: Fully installable on iOS/Android with push notification support.
- **Command Log**: Audit trail of every hardware interaction and its success state.

### 🛡️ Administrative Console
- **SaaS Provisioning**: Manage client companies, subscriptions, and device limits.
- **Fleet Control**: Global view of all connected sensors, IP/MAC tracking, and signal strength (RSSI).
- **Firmware Engine**: Repository of firmware versions with automated changelog management.
- **Impersonation Mode**: Secure access to client dashboards for remote support.

---

## 🛠️ Stack & Architecture

### Backend (Node.js)
- **Express.js**: RESTful API for portal management.
- **Socket.io**: Real-time bi-directional events for telemetry and ACKs.
- **MQTT (Aedes)**: Integrated broker for low-latency hardware communication.
- **JWT & HTTP-only Cookies**: Secure session management.
- **SQLite3**: Reliable and portable structured data storage.

### Frontend (Modern Vanilla JS)
- **Unifi-inspired UI**: Premium dark/light themes with high contrast and smooth transitions.
- **Lucide Icons**: Crisp, vector-based iconography.
- **Tippy.js**: Contextual tooltips for optimal UX.
- **Chart.js**: Analytical data visualization.

### Firmware (C++/Arduino)
- Optimized for **ESP32C6 Pulsar**.
- **NVS Persistence**: Secure storage of adoption tokens and WiFi credentials.
- **WiFiManager**: Zero-config initial setup via Hotspot.

---

## 📦 Installation & Setup

1. **Clone the Repo**:
   ```bash
   git clone https://github.com/flavioGonz/coldsense.git
   cd coldsense/server
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Initialize Database**:
   ```bash
   node database.js
   ```

4. **Run the Server**:
   ```bash
   npm start
   ```

---

## 📄 License & Attribution

Developed by **Antigravity AI** for the **Cold Sense Team**.  
Specialized in high-reliability IoT ecosystems.
