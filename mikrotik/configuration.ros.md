# MikroTik MQTT Signaling Server Configuration

To use your MikroTik as a **signaling server**, follow these CLI commands.

## 1. Install IoT Package
Ensure the `iot` package is installed. (Check `/system package print`).

## 2. Configure MQTT Broker (Client-side)
Change `address` to your broker's IP or hostname.

```ros
/iot mqtt brokers
add name="ColdSenseBroker" address="192.168.99.1" port=1883 ssl=no client-id="RouterOS-Signaling" auto-connect=yes keep-alive=60
```

## 3. Connect to Broker
```ros
/iot mqtt connect broker="ColdSenseBroker"
```

## 4. Subscribe to Sensor Data and Assign Script
This is where the "signaling logic" happens.

```ros
/iot mqtt subscribe broker="ColdSenseBroker" topic="cold-sense/telemetry/+" on-message="ProcessSensorMessage"
```

## 5. Create the "ProcessSensorMessage" Script
This script triggers when a message is received.

```ros
/system script add name="ProcessSensorMessage" source={
    :local payload [:pick $message 0 1024]
    :log info ("Cold Sense Message Received: " . $payload)

    # Example: If temperature is > 30, add a log entry or change LED
    # (Parasing JSON in RouterOS script can be complex; using regex or :find)
    
    :if ([:find $payload "\"alert\":true"] != -1) do={
        :log warning "COLD SENSE ALERT DETECTED!"
        /tool fetch url="https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<ID>&text=CRITICAL_ALERT" keep-result=no
    }
}
```

## 6. (Advanced) Run Mosquitto as a Container
If your MikroTik supports containers (e.g., hAP ax3, RB5009, etc.):

```ros
/container config set registry-url=https://registry-1.docker.io
/container add remote-image="eclipse-mosquitto:latest" interface=veth1 root-dir=disk1/mosquitto envlist=mosquitto_env
/container start 0
```
