import os
import sys
from dotenv import load_dotenv
import paho.mqtt.client as mqtt
import json
import struct
import base64
from base64 import b64decode
from Crypto.Cipher import AES

from google.protobuf.message import DecodeError
from meshtastic import mesh_pb2, portnums_pb2, telemetry_pb2, mqtt_pb2

# === Configuration ===
load_dotenv()
MQTT_BROKER = os.getenv("MQTT_BROKER")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_TOPIC = os.getenv("MQTT_TOPIC")
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", 60))
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "meshtastic_decoder")

# === Decoder for known port payloads ===
def decode_port_payload(portnum, payload_bytes):
    try:
        if portnum == 0 or portnum == portnums_pb2.PortNum.UNKNOWN_APP:
            # PortNum 0 is often channel/routing info
            text = payload_bytes.decode("utf-8", errors="replace")
            return {"type": "channel_info", "channel_name": text}
        
        elif portnum == 1 or portnum == portnums_pb2.PortNum.TEXT_MESSAGE_APP:
            return {"type": "text_message", "message": payload_bytes.decode("utf-8", errors="replace")}

        elif portnum == 3 or portnum == portnums_pb2.PortNum.POSITION_APP:
            pos = mesh_pb2.Position()
            pos.ParseFromString(payload_bytes)
            return {
                "type": "position",
                "latitude": pos.latitude_i / 1e7 if pos.latitude_i else None,
                "longitude": pos.longitude_i / 1e7 if pos.longitude_i else None,
                "altitude": pos.altitude if pos.altitude != 0 else None,
                "time": pos.time if pos.time else None,
                "precision_bits": pos.precision_bits if hasattr(pos, 'precision_bits') else None
            }

        elif portnum == 4 or portnum == portnums_pb2.PortNum.NODEINFO_APP:
            user = mesh_pb2.User()
            user.ParseFromString(payload_bytes)
            return {
                "type": "nodeinfo",
                "long_name": user.long_name,
                "short_name": user.short_name,
                "macaddr": user.macaddr.hex() if user.macaddr else None,
                "hw_model": user.hw_model,
                "is_licensed": user.is_licensed,
                "role": user.role
            }

        elif portnum == 8 or portnum == portnums_pb2.PortNum.WAYPOINT_APP:
            waypoint = mesh_pb2.Waypoint()
            waypoint.ParseFromString(payload_bytes)
            return {
                "type": "waypoint",
                "id": waypoint.id,
                "latitude": waypoint.latitude_i / 1e7 if waypoint.latitude_i else None,
                "longitude": waypoint.longitude_i / 1e7 if waypoint.longitude_i else None,
                "expire": waypoint.expire,
                "locked_to": waypoint.locked_to,
                "name": waypoint.name,
                "description": waypoint.description,
                "icon": waypoint.icon
            }

        elif portnum == 67 or portnum == portnums_pb2.PortNum.TELEMETRY_APP:
            tel = telemetry_pb2.Telemetry()
            tel.ParseFromString(payload_bytes)
            
            result = {"type": "telemetry"}
            
            # Device metrics
            if tel.HasField("device_metrics"):
                result["device_metrics"] = {
                    "battery_level": tel.device_metrics.battery_level if tel.device_metrics.battery_level != 0 else None,
                    "voltage": tel.device_metrics.voltage if tel.device_metrics.voltage != 0 else None,
                    "channel_utilization": tel.device_metrics.channel_utilization if tel.device_metrics.channel_utilization != 0 else None,
                    "air_util_tx": tel.device_metrics.air_util_tx if tel.device_metrics.air_util_tx != 0 else None,
                    "uptime_seconds": tel.device_metrics.uptime_seconds if tel.device_metrics.uptime_seconds != 0 else None
                }
            
            # Environment metrics
            if tel.HasField("environment_metrics"):
                result["environment_metrics"] = {
                    "temperature": tel.environment_metrics.temperature if tel.environment_metrics.temperature != 0 else None,
                    "relative_humidity": tel.environment_metrics.relative_humidity if tel.environment_metrics.relative_humidity != 0 else None,
                    "barometric_pressure": tel.environment_metrics.barometric_pressure if tel.environment_metrics.barometric_pressure != 0 else None,
                    "gas_resistance": tel.environment_metrics.gas_resistance if tel.environment_metrics.gas_resistance != 0 else None,
                    "voltage": tel.environment_metrics.voltage if tel.environment_metrics.voltage != 0 else None,
                    "current": tel.environment_metrics.current if tel.environment_metrics.current != 0 else None,
                    "iaq": tel.environment_metrics.iaq if tel.environment_metrics.iaq != 0 else None,
                    "wind_direction": tel.environment_metrics.wind_direction,
                    "wind_speed": tel.environment_metrics.wind_speed,
                    "wind_gust": tel.environment_metrics.wind_gust,
                    "wind_lull": tel.environment_metrics.wind_lull
                }
            
            # Power metrics
            if tel.HasField("power_metrics"):
                result["power_metrics"] = {
                    "ch1_voltage": tel.power_metrics.ch1_voltage if tel.power_metrics.ch1_voltage != 0 else None,
                    "ch1_current": tel.power_metrics.ch1_current if tel.power_metrics.ch1_current != 0 else None,
                    "ch2_voltage": tel.power_metrics.ch2_voltage if tel.power_metrics.ch2_voltage != 0 else None,
                    "ch2_current": tel.power_metrics.ch2_current if tel.power_metrics.ch2_current != 0 else None,
                    "ch3_voltage": tel.power_metrics.ch3_voltage if tel.power_metrics.ch3_voltage != 0 else None,
                    "ch3_current": tel.power_metrics.ch3_current if tel.power_metrics.ch3_current != 0 else None
                }
            
            return result

        elif portnum == 70 or portnum == portnums_pb2.PortNum.TRACEROUTE_APP:
            route = mesh_pb2.RouteDiscovery()
            route.ParseFromString(payload_bytes)
            return {
                "type": "traceroute",
                "route": list(route.route),
                "snr_towards": list(route.snr_towards),
                "route_back": list(route.route_back),
                "snr_back": list(route.snr_back)
            }

        elif portnum == 71 or portnum == portnums_pb2.PortNum.NEIGHBORINFO_APP:
            neighbor_info = mesh_pb2.NeighborInfo()
            neighbor_info.ParseFromString(payload_bytes)
            return {
                "type": "neighbor_info",
                "node_broadcast_interval_secs": neighbor_info.node_broadcast_interval_secs,
                "neighbors": [
                    {
                        "node_id": neighbor.node_id,
                        "snr": neighbor.snr
                    }
                    for neighbor in neighbor_info.neighbors
                ]
            }

        elif portnum == 73 or portnum == portnums_pb2.PortNum.MAP_REPORT_APP:
            map_report = mqtt_pb2.MapReport()
            map_report.ParseFromString(payload_bytes)
            return {
                "type": "map_report",
                "long_name": map_report.long_name,
                "short_name": map_report.short_name,
                "role": map_report.role,
                "hw_model": map_report.hw_model,
                "firmware_version": map_report.firmware_version,
                "region": map_report.region,
                "modem_preset": map_report.modem_preset,
                "has_default_channel": map_report.has_default_channel,
                "latitude": map_report.latitude_i / 1e7 if map_report.latitude_i else None,
                "longitude": map_report.longitude_i / 1e7 if map_report.longitude_i else None,
                "altitude": map_report.altitude if map_report.altitude != 0 else None,
                "position_precision": map_report.position_precision,
                "num_online_local_nodes": map_report.num_online_local_nodes
            }

        # Ignored portnums (as per JavaScript implementation)
        elif portnum in [5, 34, 65, 66, 72, 257] or portnum > 511:
            return {"type": "ignored", "portnum": portnum, "reason": "filtered_out"}

        else:
            return {"type": f"unknown:{portnum}", "raw": payload_bytes.hex(" ")}

    except DecodeError as e:
        return {"type": "decode_error", "error": str(e), "raw": payload_bytes.hex(" ")}

def create_nonce(packet_id, from_node):
    """Create nonce for AES-CTR decryption"""
    # Create nonce buffer (16 bytes) exactly as in the JavaScript reference
    nonce = bytearray(16)
    
    # Write packetId (8 bytes, little endian)
    struct.pack_into('<Q', nonce, 0, packet_id)
    
    # Write fromNode (4 bytes, little endian) 
    struct.pack_into('<I', nonce, 8, from_node)
    
    # Write block counter (4 bytes, little endian) - starts at 0
    struct.pack_into('<I', nonce, 12, 0)
    
    return bytes(nonce)

def decrypt_payload(encrypted_bytes, packet_id, from_node, key_b64="1PG7OiApB1nwvP+rz05pAQ=="):
    """Decrypt MeshPacket using AES-CTR with proper nonce"""
    try:
        # Decode the base64 key
        key = b64decode(key_b64)
        
        if len(key) not in [16, 32]:
            print(f"[❌] Invalid key length: {len(key)} bytes")
            return None
        
        nonce = create_nonce(packet_id, from_node)
        
        # Create cipher and decrypt using the full nonce as initial_value
        from Crypto.Util import Counter
        ctr = Counter.new(128, initial_value=int.from_bytes(nonce, 'big'))
        cipher = AES.new(key, AES.MODE_CTR, counter=ctr)
        decrypted = cipher.decrypt(encrypted_bytes)
        
        # Try to validate the decrypted data by parsing it as Data protobuf
        try:
            test_data = mesh_pb2.Data()
            test_data.ParseFromString(decrypted)
            print(f"[🔓] Successfully decrypted {len(decrypted)} bytes")
            return decrypted
        except Exception as e:
            print(f"[❌] Decrypted data is not valid protobuf: {e}")
            return None
            
    except Exception as e:
        print(f"[❌] Decryption error: {e}")
        return None
    
    print(f"[❌] Failed to decrypt with any of {len(keys_b64 if isinstance(keys_b64, list) else [keys_b64])} keys")
    return None

# === MQTT Callbacks ===
def on_connect(client, userdata, flags, rc):
    print(f"[MQTT] Connected (rc={rc})")
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    print(f"\n[📨] Topic: {msg.topic}")
    try:
        # Parse as ServiceEnvelope (this is what the MQTT broker actually sends)
        envelope = mqtt_pb2.ServiceEnvelope()
        envelope.ParseFromString(msg.payload)
        
        print(f"[📦] ServiceEnvelope channel_id: {envelope.channel_id}")
        print(f"[📦] ServiceEnvelope gateway_id: {envelope.gateway_id}")
        
        if not envelope.packet:
            print("[❌] No packet in envelope")
            return
            
        packet = envelope.packet
        print(f"[📦] MeshPacket from: {getattr(packet, 'from'):08x}, to: {packet.to:08x}, id: {packet.id:08x}")
        print(f"[📦] Channel: {packet.channel}, hop_limit: {packet.hop_limit}")
        
        # Check if packet has encrypted data
        if hasattr(packet, 'encrypted') and packet.encrypted:
            print(f"[🔒] Found encrypted field with {len(packet.encrypted)} bytes")
            
            # Try to decrypt with default key
            decrypted_bytes = decrypt_payload(packet.encrypted, packet.id, getattr(packet, 'from'))
            if decrypted_bytes:
                print(f"[�] Successfully decrypted {len(decrypted_bytes)} bytes")
                
                # Parse decrypted data as Data protobuf
                try:
                    data_msg = mesh_pb2.Data()
                    data_msg.ParseFromString(decrypted_bytes)
                    print("[✅] Decrypted data parsed successfully")
                except Exception as e:
                    print(f"[❌] Failed to parse decrypted data: {e}")
                    return
            else:
                print("[❌] Failed to decrypt")
                return
        elif hasattr(packet, 'decoded') and packet.decoded:
            # Unencrypted data
            data_msg = packet.decoded
            print("[�] Found unencrypted decoded data")
        else:
            print("[❌] No encrypted or decoded data found in packet")
            return
        
        # Show all fields for debugging
        print("[📦] Data message fields:", [field.name for field, _ in data_msg.ListFields()])
        for field, value in data_msg.ListFields():
            if field.name == 'payload' and isinstance(value, bytes):
                try:
                    text_value = value.decode('utf-8', errors='replace')
                    print(f"[📄] {field.name}: '{text_value}' (text)")
                except:
                    print(f"[📄] {field.name}: {value.hex(' ')} (hex, {len(value)} bytes)")
            else:
                print(f"[📄] {field.name}: {value}")
        
        # Process the data if it has a portnum and payload
        if hasattr(data_msg, 'portnum') and hasattr(data_msg, 'payload'):
            portnum = data_msg.portnum
            payload = data_msg.payload
            print(f"[ℹ️] PortNum: {portnum} (0x{portnum:x})")
            
            # Show some statistics
            portnum_names = {
                0: "UNKNOWN_APP",
                1: "TEXT_MESSAGE_APP", 
                3: "POSITION_APP",
                4: "NODEINFO_APP",
                8: "WAYPOINT_APP", 
                67: "TELEMETRY_APP",
                70: "TRACEROUTE_APP",
                71: "NEIGHBORINFO_APP",
                73: "MAP_REPORT_APP"
            }
            portnum_name = portnum_names.get(portnum, f"UNKNOWN_{portnum}")
            print(f"[ℹ️] App: {portnum_name}")
            
            if payload:
                decoded = decode_port_payload(portnum, payload)
                print("[✅] Decoded payload:")
                print(json.dumps(decoded, indent=2))
            else:
                print("[❌] No payload in data message")
        else:
            print("[ℹ️] Missing portnum or payload fields")
            print(f"[�] Available fields: {[field.name for field, _ in data_msg.ListFields()]}")

    except DecodeError as e:
        print(f"[⚠] Failed to parse Data: {e}")
        print("[HEX] Raw:", msg.payload.hex(" "))
    except Exception as e:
        print(f"[‼] Unexpected error: {e}")
        import traceback
        traceback.print_exc()

# === Main ===
def main():
    client = mqtt.Client(client_id=MQTT_CLIENT_ID)
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message

    print(f"[📡] Connecting to {MQTT_BROKER}:{MQTT_PORT} with client ID '{MQTT_CLIENT_ID}' ...")
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE)
        client.loop_forever()
    except Exception as e:
        print(f"[❌] Connection error: {e}")

if __name__ == "__main__":
    main()
