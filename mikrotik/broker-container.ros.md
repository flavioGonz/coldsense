# 🐳 Configuring MikroTik as an MQTT Broker (Container)

MikroTik RouterOS (v7+) does not have a native "MQTT Broker" service. It achieves this by running a **Container (Mosquitto)**.

> [!WARNING]
> **Requisitos Previos**:
> 1. RouterOS v7.4 o superior.
> 2. Arquitectura ARM, ARM64 o x86.
> 3. Almacenamiento externo (recomiendo un USB formateado en ext4) para evitar dañar la memoria flash interna.

## 1. Habilitar modo Container (Seguridad)
Por seguridad, MikroTik requiere habilitar físicamente el modo container:

```ros
/system device-mode update container=yes
```
*Después de este comando, tendrás 5 minutos para presionar el botón **Reset** del router o desconectar/conectar el cable de corriente para confirmar.*

## 2. Configurar el Entorno
Crea una interfaz virtual (`veth`) y un puente para el contenedor:

```ros
# Crear red para el contenedor (ej: 172.17.0.x)
/interface veth add name=veth1 address=172.17.0.2/24 gateway=172.17.0.1
/interface bridge add name=bridge-iot
/interface bridge port add bridge=bridge-iot interface=veth1
/ip address add address=172.17.0.1/24 interface=bridge-iot
```

## 3. Configurar Registro Docker
```ros
/container config set registry-url=https://registry-1.docker.io tmpdir=disk1/tmp
```
*Nota: Cambia `disk1` por el nombre de tu USB/Disco.*

## 4. Descargar e Instalar Mosquitto
```ros
/container add remote-image="eclipse-mosquitto:latest" interface=veth1 root-dir=disk1/mosquitto logging=yes
```

## 5. Firewall (Permitir Puerto 1883)
Debes permitir el tráfico MQTT hacia el contenedor:

```ros
/ip firewall filter
add action=accept chain=input dst-port=1883 protocol=tcp comment="Allow MQTT"
add action=accept chain=forward dst-port=1883 protocol=tcp comment="Forward to Mosquitto"
```

## 6. Autenticación (Opcional)
Por defecto, las imágenes modernas de Mosquitto no permiten conexiones anónimas. Debes crear un archivo de configuración si quieres usarlas, o pasar variables al contenedor.

Para una prueba rápida inicial, intenta iniciar el contenedor:
```ros
/container start 0
```

---

### ¿Tu MikroTik no soporta Containers?
Si tu modelo es antiguo o no soporta contenedores, la única opción es usar el MikroTik como **cliente** de un broker externo (como el servidor Express que ya tienes en tu PC). El servidor Express puede ser el broker usando la librería `aedes` si lo deseas.

¿Qué modelo de MikroTik tienes?
