import os
from dotenv import load_dotenv
import paho.mqtt.client as mqtt
import json
import struct
from base64 import b64decode
from Crypto.Cipher import AES

from google.protobuf.message import DecodeError
from meshtastic import mesh_pb2, portnums_pb2
from meshtastic.protobuf import mesh_pb2 as mesh_pb2_alt

# === Configuration ===
load_dotenv()
MQTT_BROKER = os.getenv("MQTT_BROKER")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_TOPIC = os.getenv("MQTT_TOPIC")
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", 60))

# === Decoder for known port payloads ===
def decode_port_payload(portnum, payload_bytes):
    try:
        if portnum == 0 or portnum == portnums_pb2.PortNum.UNKNOWN_APP:
            # PortNum 0 is often channel/routing info
            text = payload_bytes.decode("utf-8", errors="replace")
            return {"type": "channel_info", "channel_name": text}
        
        elif portnum == portnums_pb2.PortNum.TEXT_MESSAGE_APP:
            return {"type": "text", "message": payload_bytes.decode("utf-8", errors="replace")}

        elif portnum == portnums_pb2.PortNum.POSITION_APP:
            from meshtastic import position_pb2
            pos = position_pb2.Position()
            pos.ParseFromString(payload_bytes)
            return {
                "type": "position",
                "latitude": pos.latitude_i / 1e7,
                "longitude": pos.longitude_i / 1e7,
                "altitude": pos.altitude,
                "time": pos.time
            }

        elif portnum == portnums_pb2.PortNum.NODEINFO_APP:
            from meshtastic import nodeinfo_pb2
            info = nodeinfo_pb2.NodeInfo()
            info.ParseFromString(payload_bytes)
            return {
                "type": "nodeinfo",
                "long_name": info.user.long_name,
                "short_name": info.user.short_name,
                "macaddr": info.user.macaddr
            }

        elif portnum == portnums_pb2.PortNum.TELEMETRY_APP:
            from meshtastic import telemetry_pb2
            tel = telemetry_pb2.Telemetry()
            tel.ParseFromString(payload_bytes)
            return {
                "type": "telemetry",
                "battery_level": tel.battery_level,
                "voltage": tel.voltage,
                "channel_utilization": tel.channel_utilization
            }

        else:
            return {"type": f"unknown:{portnum}", "raw": payload_bytes.hex(" ")}

    except DecodeError as e:
        return {"type": "decode_error", "error": str(e), "raw": payload_bytes.hex(" ")}

def create_nonce(packet_id, from_node):
    """Create nonce for AES-CTR decryption"""
    # Expand packetId to 64 bits
    packet_id_64 = packet_id & 0xFFFFFFFFFFFFFFFF
    
    # Initialize block counter (32-bit, starts at zero)
    block_counter = 0
    
    # Create nonce buffer (16 bytes)
    nonce = bytearray(16)
    
    # Write packetId (8 bytes, little endian)
    struct.pack_into('<Q', nonce, 0, packet_id_64)
    
    # Write fromNode (4 bytes, little endian)
    struct.pack_into('<I', nonce, 8, from_node)
    
    # Write block counter (4 bytes, little endian)
    struct.pack_into('<I', nonce, 12, block_counter)
    
    return bytes(nonce)

def decrypt_payload(encrypted_bytes, packet_id, from_node, key_b64="AQ=="):
    """Decrypt MeshPacket using AES-CTR with proper nonce"""
    try:
        key = b64decode(key_b64)
        nonce = create_nonce(packet_id, from_node)
        
        # Determine algorithm based on key length
        if len(key) == 16:
            algorithm = "aes-128-ctr"
        elif len(key) == 32:
            algorithm = "aes-256-ctr" 
        else:
            print(f"[❌] Invalid key length: {len(key)}")
            return None
            
        # Create cipher and decrypt
        cipher = AES.new(key, AES.MODE_CTR, nonce=nonce)
        decrypted = cipher.decrypt(encrypted_bytes)
        return decrypted
    except Exception as e:
        print(f"[❌] Decryption error: {e}")
        return None

# === MQTT Callbacks ===
def on_connect(client, userdata, flags, rc):
    print(f"[MQTT] Connected (rc={rc})")
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    print(f"\n[📨] Topic: {msg.topic}")
    try:
        # Parse as Data protobuf (this is what the MQTT broker actually sends)
        data_msg = mesh_pb2.Data()
        data_msg.ParseFromString(msg.payload)
        
        print("[📦] Data message:")
        print(data_msg)
        
        # Process the data if it has a portnum and payload
        if hasattr(data_msg, 'portnum') and hasattr(data_msg, 'payload'):
            portnum = data_msg.portnum
            payload = data_msg.payload
            print(f"[ℹ️] PortNum: {portnum}")
            if payload:
                decoded = decode_port_payload(portnum, payload)
                print("[✅] Decoded payload:")
                print(json.dumps(decoded, indent=2))
            else:
                print("[ℹ️] No payload to decode")
        else:
            print("[ℹ️] Data message structure:")
            fields = [field.name for field, _ in data_msg.ListFields()]
            print(f"[📋] Available fields: {fields}")
            
            # Print all field values
            for field, value in data_msg.ListFields():
                if field.name == 'payload' and isinstance(value, bytes):
                    try:
                        # Try to decode as text
                        text_value = value.decode('utf-8', errors='replace')
                        print(f"[📄] {field.name}: '{text_value}' (text)")
                    except:
                        print(f"[📄] {field.name}: {value.hex(' ')} (hex)")
                else:
                    print(f"[📄] {field.name}: {value}")

    except DecodeError as e:
        print(f"[⚠] Failed to parse Data: {e}")
        print("[HEX] Raw:", msg.payload.hex(" "))
    except Exception as e:
        print(f"[‼] Unexpected error: {e}")
        import traceback
        traceback.print_exc()

# === Main ===
def main():
    client = mqtt.Client()
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message

    print(f"[📡] Connecting to {MQTT_BROKER}:{MQTT_PORT} ...")
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE)
        client.loop_forever()
    except Exception as e:
        print(f"[❌] Connection error: {e}")

if __name__ == "__main__":
    main()
