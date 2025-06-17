#!/usr/bin/env python3
"""
Demo data script to populate sample Meshtastic network data
"""

from database import MeshtasticDB
from datetime import datetime, timedelta
import random
import json

def create_demo_data():
    print("🎬 Creating demo Meshtastic network data...")
    
    # Initialize database
    db = MeshtasticDB("meshtastic.db")
    
    # Demo node locations around Portugal
    demo_nodes = [
        {
            'node_id': '4a1b2c3d',
            'long_name': 'Lisbon Gateway',
            'short_name': 'LIS1',
            'hardware_model': 1,
            'latitude': 38.7223,
            'longitude': -9.1393,
            'altitude': 50,
            'battery_level': 95,
            'voltage': 4.1,
            'role': 1
        },
        {
            'node_id': '5e2f3g4h',
            'long_name': 'Porto Node',
            'short_name': 'PRT1',
            'hardware_model': 2,
            'latitude': 41.1579,
            'longitude': -8.6291,
            'altitude': 100,
            'battery_level': 78,
            'voltage': 3.8,
            'role': 2
        },
        {
            'node_id': '6f3g4h5i',
            'long_name': 'Coimbra Station',
            'short_name': 'CBR1',
            'hardware_model': 1,
            'latitude': 40.2033,
            'longitude': -8.4103,
            'altitude': 75,
            'battery_level': 82,
            'voltage': 3.9,
            'role': 2
        },
        {
            'node_id': '7g4h5i6j',
            'long_name': 'Faro Beach Node',
            'short_name': 'FAR1',
            'hardware_model': 3,
            'latitude': 37.0194,
            'longitude': -7.9322,
            'altitude': 10,
            'battery_level': 89,
            'voltage': 4.0,
            'role': 2
        },
        {
            'node_id': '8h5i6j7k',
            'long_name': 'Braga Mountain',
            'short_name': 'BRG1',
            'hardware_model': 2,
            'latitude': 41.5518,
            'longitude': -8.4229,
            'altitude': 250,
            'battery_level': 72,
            'voltage': 3.7,
            'role': 2
        }
    ]
    
    print(f"📍 Creating {len(demo_nodes)} demo nodes...")
    for node in demo_nodes:
        db.update_node(node)
        print(f"   ✅ {node['long_name']} ({node['node_id']})")
    
    # Create demo connections
    connections = [
        ('4a1b2c3d', '6f3g4h5i', 8.5, -65),  # Lisbon <-> Coimbra
        ('6f3g4h5i', '5e2f3g4h', 12.2, -58), # Coimbra <-> Porto
        ('5e2f3g4h', '8h5i6j7k', 15.1, -52), # Porto <-> Braga
        ('4a1b2c3d', '7g4h5i6j', 6.8, -75),  # Lisbon <-> Faro
        ('6f3g4h5i', '7g4h5i6j', 9.3, -68),  # Coimbra <-> Faro
    ]
    
    print(f"🔗 Creating {len(connections)} demo connections...")
    for from_node, to_node, snr, rssi in connections:
        # Create multiple packets to build up connection stats
        for _ in range(random.randint(5, 20)):
            db.update_connection(from_node, to_node, 
                               snr=snr + random.uniform(-2, 2), 
                               rssi=rssi + random.randint(-10, 10))
        print(f"   ✅ {from_node[-4:]} → {to_node[-4:]}")
    
    # Create demo packets
    packet_types = [
        ('text_message', {'type': 'text_message', 'message': 'Hello from the network!'}),
        ('position', {'type': 'position', 'latitude': 38.7223, 'longitude': -9.1393}),
        ('telemetry', {'type': 'telemetry', 'device_metrics': {'battery_level': 85, 'voltage': 3.8}}),
        ('nodeinfo', {'type': 'nodeinfo', 'long_name': 'Test Node', 'short_name': 'TEST'}),
    ]
    
    print(f"📦 Creating demo packets...")
    base_time = datetime.now() - timedelta(hours=1)
    
    for i in range(50):
        from_node = random.choice(demo_nodes)['node_id']
        to_node = random.choice(['ffffffff'] + [n['node_id'] for n in demo_nodes if n['node_id'] != from_node])
        packet_type, payload_data = random.choice(packet_types)
        
        packet_data = {
            'packet_id': f'{random.randint(0x10000000, 0xffffffff):08x}',
            'from_node': from_node,
            'to_node': to_node,
            'portnum': random.randint(1, 10),
            'channel': 0,
            'hop_limit': random.randint(1, 3),
            'want_ack': random.choice([True, False]),
            'rx_time': base_time + timedelta(minutes=i*2),
            'rx_snr': random.uniform(-20, 20),
            'rx_rssi': random.randint(-100, -30),
            'payload_type': packet_type,
            'payload_data': payload_data,
            'gateway_id': 'demo_gateway'
        }
        
        db.add_packet(packet_data)
    
    print(f"   ✅ Created 50 demo packets")
    
    # Print summary
    nodes = db.get_nodes()
    connections = db.get_connections()
    packets = db.get_recent_packets(100)
    
    print("\n📊 Demo Data Summary:")
    print(f"   📍 Nodes: {len(nodes)}")
    print(f"   🔗 Connections: {len(connections)}")
    print(f"   📦 Packets: {len(packets)}")
    print("\n🎉 Demo data created successfully!")
    print("\n🚀 Run 'uv run python run_dashboard.py' to start the dashboard")

if __name__ == "__main__":
    create_demo_data()
