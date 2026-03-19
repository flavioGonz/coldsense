const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
  console.log('✅ [TEST] Local MQTT connected!');
  const payload = JSON.stringify({
    device_id: "TEST-01",
    type: "heartbeat",
    fw: "3.2.0",
    model: "ColdSense-Test",
    ip: "127.0.0.1",
    rssi: -1,
    uptime_secs: 10,
    adopted: false
  });
  
  client.publish('clients/unassigned/sensors/TEST-01/telemetry', payload, () => {
    console.log('📡 [TEST] Message published!');
    client.end();
  });
});

client.on('error', (err) => {
  console.error('❌ [TEST] Error:', err.message);
});
