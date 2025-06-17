#!/usr/bin/env python3
"""
Test script to verify database functionality
"""

from database import MeshtasticDB
from datetime import datetime
import json

def test_database():
    print("🧪 Testing Meshtastic Database...")
    
    # Initialize database
    db = MeshtasticDB("test_meshtastic.db")
    
    # Test node creation
    print("📍 Testing node creation...")
    node_data = {
        'node_id': '1a2b3c4d',
        'long_name': 'Test Node',
        'short_name': 'TEST',
        'hardware_model': 1,
        'latitude': 39.4,
        'longitude': -8.2,
        'altitude': 100,
        'battery_level': 85,
        'voltage': 3.7
    }
    
    db.update_node(node_data)
    print(f"✅ Created node: {node_data['long_name']}")
    
    # Test packet creation
    print("📦 Testing packet creation...")
    packet_data = {
        'packet_id': 'abcd1234',
        'from_node': '1a2b3c4d',
        'to_node': 'ffffffff',
        'portnum': 1,
        'channel': 0,
        'hop_limit': 3,
        'want_ack': False,
        'rx_time': datetime.now(),
        'payload_type': 'text_message',
        'payload_data': {'type': 'text_message', 'message': 'Hello, Meshtastic!'},
        'gateway_id': 'gateway001'
    }
    
    db.add_packet(packet_data)
    print(f"✅ Created packet: {packet_data['payload_data']['message']}")
    
    # Test connection creation
    print("🔗 Testing connection creation...")
    db.update_connection('1a2b3c4d', '5e6f7g8h', snr=12.5, rssi=-45)
    print("✅ Created connection")
    
    # Test data retrieval
    print("📊 Testing data retrieval...")
    nodes = db.get_nodes()
    connections = db.get_connections()
    packets = db.get_recent_packets(10)
    
    print(f"📍 Nodes: {len(nodes)}")
    print(f"🔗 Connections: {len(connections)}")
    print(f"📦 Packets: {len(packets)}")
    
    if nodes:
        print(f"   First node: {nodes[0]['long_name']} ({nodes[0]['node_id']})")
    
    if connections:
        print(f"   First connection: {connections[0]['from_node']} → {connections[0]['to_node']}")
    
    if packets:
        print(f"   First packet: {packets[0]['payload_type']}")
    
    print("🎉 Database test completed successfully!")
    
    # Cleanup
    import os
    try:
        os.remove("test_meshtastic.db")
        print("🧹 Cleaned up test database")
    except:
        pass

if __name__ == "__main__":
    test_database()
