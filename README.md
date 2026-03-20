# ❄️ Cold Sense: Enterprise IoT Thermal Monitoring & Control

**Cold Sense** is a state-of-the-art, full-stack SaaS platform designed for real-time monitoring of refrigeration chains, specialized for pharmaceutical and food logistics. Built with a focus on reliability, visual excellence, and hardware-software synergy.

![Cold Sense Dashboard Mockup](https://raw.githubusercontent.com/flavioGonz/coldsense/main/mockup.png)

## 🚀 Core Features

### 📡 Smart Hardware (Unified Protocol v3.4)
- **Mauri-Unified Protocol**: High-performance JSON telemetry with consistent data mapping.
- **Real-time Telemetry**: Monitoring of interior/exterior temperatures (`tIn` / `tOut`).
- **Door Security**: Detection of open/closed states with MQTT event mapping.
- **Secure OTA Updates**: Remote firmware management via LAN-aware tunnels (binary .bin only).
- **Local Control**: Execution of GPIO commands (reboot, door unlock) with ACK confirmation.

### 🏢 Enterprise Portal (Client)
- **Dynamic Dashboard**: High-fidelity cards with real-time status highlights (Normal, Warning, Critical).
- **Auto-Update PWA**: Instant-update strategy (skipWaiting) ensuring the latest version on each load.
- **Analytical Graphing**: High-resolution temperature history powered by Chart.js.
- **Multi-branch Management**: Organize hardware by physical locations.
- **Command Log**: Audit trail of every hardware interaction and its success state.

### 🛡️ Administrative Console
- **SaaS Provisioning**: Manage client companies, subscriptions, and device limits.
- **Credential Management**: Professional lock-driven UI for handling entreprise-level auth (User/Pass).
- **Fleet Control**: Global view of all connected sensors with `CS-` prefixed ID support.
- **IP/MAC Tracking**: Intelligent detection of hardware on the global SaaS network.
- **Firmware Engine**: Repository of firmware versions with automated changelog management.
- **Impersonation Mode**: Secure access to client dashboards for remote support.

---

## 🛠️ Stack & Architecture

### Backend (Node.js)
- **Express.js**: RESTful API with secure `/api/client/sensors` isolation.
- **Socket.io**: Real-time bi-directional events for telemetry and ACKs.
- **MQTT (Aedes)**: Integrated broker for low-latency hardware communication.
- **Bcrypt & JWT**: Industry-standard secure authentication.
- **SQLite3**: Reliable and portable structured data storage.

### Frontend (Modern Vanilla JS)
- **Unifi-inspired UI**: Premium dark/light themes with high contrast and smooth transitions.
- **Service Workers**: Advanced PWA caching and background update strategy.
- **Lucide Icons**: Crisp, vector-based iconography.
- **Tippy.js**: Contextual tooltips for optimal UX.

### Firmware (C++/Arduino)
- Optimized for **ESP32C6 Pulsar**.
- **NVS Persistence**: Secure storage of adoption tokens and WiFi credentials.
- **v3.4 Protocol Support**: Native integration with the ColdSense cloud infrastructure.

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
   - `JWT_SECRET=your_secure_secret`

5. **Run the Server**:
   ```bash
   npm start
   ```

---

## 📄 License & Attribution

Developed by **Antigravity AI** for the **Cold Sense Team**.  
Specialized in high-reliability IoT ecosystems.
