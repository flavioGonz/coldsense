# Cold Sense ESP32 - Project Architecture

This project uses a MikroTik Router as a **signaling server** and **ESP32** devices as smart sensors for temperature, humidity, and presence detection.

## 📡 System Topology

1.  **MQTT Broker**: The central hub for message exchange.
    *   *Option A (Recommended)*: **Mosquitto** running on a MikroTik **Container** (RouterOS v7+ on ARM/x86).
    *   *Option B*: A small local server or cloud broker (HiveMQ, AWS IoT).
2.  **Signaling Server (MikroTik)**:
    *   Uses the `iot` package.
    *   Subscribes to sensor topics (`/cold-sense/telemetry/#`).
    *   Executes RouterOS scripts (`on-message`) to perform actions based on sensor data (e.g., dynamic firewall rules, alerting, logging).
    *   Publishes configuration payloads to ESP32s (`/cold-sense/config/{id}`).
3.  **Sensors (ESP32)**:
    *   Connect to WiFi.
    *   Publish JSON data to the broker.
    *   Listen for command and configuration updates.

## 🛠 Features

- **Real-time Monitoring**: Temperature, Humidity, and Presence.
- **Dynamic Configuration**: Over-the-air settings via MQTT (polling intervals, sensitivity).
- **Edge Logic**: MikroTik can react instantly to sensor events without an external cloud.
- **Micro-animations**: A future web dashboard for visual wow-factor.

## 📁 Directory Structure
- `/firmware`: ESP32 source code (Arduino/C++).
- `/mikrotik`: RouterOS scripts and configuration snippets.
- `/server`: (Optional) Express.js dashboard and database integration.
