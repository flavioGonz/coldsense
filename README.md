# ❄️ Cold Sense: Enterprise IoT Thermal Monitoring & Control

**Cold Sense** is a state-of-the-art, full-stack SaaS platform designed for real-time monitoring of refrigeration chains, specialized for pharmaceutical and food logistics. Built with a focus on reliability, visual excellence, and hardware-software synergy.

![Cold Sense Dashboard Mockup](https://raw.githubusercontent.com/flavioGonz/coldsense/main/mockup.png)

## 🚀 Core Features (v3.5 Pulsar Update)

### 📡 Smart Hardware (Unified Protocol v3.5)
- **Auto-Discovery & Adoption**: Modern handshake flow where the server automatically provision devices via `adopt` and `config` MQTT commands.
- **Mauri-Unified Protocol**: High-performance JSON telemetry (`tIn`, `tOut`, `hum`, `door`, `rssi`).
- **Real-time Telemetry**: High-resolution monitoring of interior/exterior temperatures and humidity.
- **Secure OTA Updates**: Remote firmware management via LAN-aware tunnels with automatic version tracking.
- **ACK Confirmation**: Every command (Reboot, Open Door, OTA) is acknowledged by the hardware for a robust audit trail.

### 🏢 Enterprise Portal (Client & PWA)
- **Dynamic Dashboard**: Unifi-inspired UI with real-time status highlights and high-contrast dark/light themes.
- **Bitácora de Alertas**: Real-time logging of critical events (T° breaches, native hardware alarms, security events).
- **Interactive Graphs**: Historical data visualizer powered by Chart.js.
- **Event Audit**: New **"DETALLE (RAW)"** column in the event flow for technical transparency of MQTT payloads.
- **Progressive Web App (PWA)**: Desktop/Mobile experience with service workers and instant update strategy.

### 🛡️ Administrative Console
- **Fleet Management**: Global control of all sensors with `CS-` prefixed ID support.
- **SaaS Provisioning**: Full management of client companies, subscriptions, and device limits.
- **Firmware Repository**: Centralized .bin management with automatic versioning and changelogs.
- **Impersonation Mode**: Secure remote support by accessing any client's dashboard with admin credentials.
- **Network Traffic Log**: Real-time visualization of all MQTT traffic across the SaaS network.

---

## 🛠️ Stack & Architecture

### Backend (Node.js)
- **Express.js**: Secure RESTful API with JWT/Bcrypt authentication.
- **Socket.io**: Low-latency bi-directional event stream.
- **MQTT (Aedes)**: High-performance integrated broker for hardware orchestration.
- **SQLite3**: ACID-compliant portable data storage.

### Frontend (Modern Vanilla JS/CSS)
- **Unifi-inspired Aesthetics**: Premium dark mode with sleek borders and industrial icons.
- **Lucide Icons & Tippy.js**: CRISP vector graphics and contextual UX feedback.
- **Service Workers**: Advanced PWA caching for offline-first reliability.

### Firmware (C++/Arduino)
- **Target Hardware**: ESP32-C6 (Pulsar Edition).
- **Communication Protocol**: Mauri Protocol v3.5.
- **Specification Documentation**: Detailed technical spec available in [SPEC_FIRMWARE_MAURI.md](./SPEC_FIRMWARE_MAURI.md).

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

4. **Environment Configuration**:
   Create a `.env` file in `/server` with:
   - `PORT=4000`
   - `JWT_SECRET=your_secure_secret_key`

5. **Run Development Server**:
   ```bash
   npm run dev
   ```

---

## 📄 License & Attribution

Developed by **Antigravity AI** for the **Cold Sense Team**.  
Specialized in high-reliability industrial IoT ecosystems.
© 2026 ColdSense Global.
