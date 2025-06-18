#!/usr/bin/env python3
"""
Database status script - shows current network state
"""

from database import MeshtasticDB
import json
import os
from datetime import datetime, timedelta

def show_database_status():
    print("📊 Meshtastic Network Database Status")
    print("=" * 50)
    
    db = MeshtasticDB("meshtastic.db")
    
    # Get all data
    nodes = db.get_nodes()
    positioned_nodes = db.get_nodes_with_position()
    connections = db.get_connections()
    packets = db.get_recent_packets(20)
    
    print(f"\n📍 All Nodes ({len(nodes)} total, {len(positioned_nodes)} with position):")
    print("-" * 50)
    
    for node in nodes[:15]:  # Show first 15 nodes
        lat = node['latitude'] or 0
        lon = node['longitude'] or 0
        battery = f"{node['battery_level']}%" if node['battery_level'] else "N/A"
        last_seen = node['last_seen'] or "Never"
        has_pos = "📍" if node['latitude'] and node['longitude'] else "❓"
        
        print(f"  {has_pos} {node['long_name'] or node['short_name'] or node['node_id']}")
        print(f"     ID: {node['node_id']}")
        if node['latitude'] and node['longitude']:
            print(f"     Location: {lat:.4f}, {lon:.4f}")
        else:
            print(f"     Location: Unknown")
        print(f"     Battery: {battery}")
        print(f"     Last seen: {last_seen}")
        print()
    
    if len(nodes) > 15:
        print(f"     ... and {len(nodes) - 15} more nodes")
    
    print(f"\n🔗 Connections ({len(connections)} total):")
    print("-" * 30)
    
    for conn in connections[:10]:  # Show first 10 connections
        from_short = conn['from_node'][-4:]
        to_short = conn['to_node'][-4:]
        count = conn['packet_count']
        snr = f"{conn['avg_snr']:.1f}" if conn['avg_snr'] else "N/A"
        
        print(f"  🔸 {from_short} → {to_short}: {count} packets (SNR: {snr})")
    
    if len(connections) > 10:
        print(f"     ... and {len(connections) - 10} more connections")
    
    print(f"\n📦 Recent Packets ({len(packets)} shown):")
    print("-" * 30)
    
    for packet in packets[:10]:  # Show last 10 packets
        from_short = packet['from_node'][-4:] if packet['from_node'] else "????"
        to_short = packet['to_node'][-4:] if packet['to_node'] else "????"
        ptype = packet['payload_type'] or "unknown"
        timestamp = packet['timestamp'] or "Unknown"
        
        # Try to extract meaningful content
        content = ""
        if packet['payload_data']:
            try:
                payload = json.loads(packet['payload_data'])
                if payload.get('message'):
                    content = f": '{payload['message'][:30]}...'"
                elif payload.get('latitude') and payload.get('longitude'):
                    content = f": ({payload['latitude']:.4f}, {payload['longitude']:.4f})"
                elif payload.get('device_metrics'):
                    battery = payload['device_metrics'].get('battery_level')
                    if battery:
                        content = f": Battery {battery}%"
            except:
                pass
        
        print(f"  📨 [{timestamp[:19]}] {from_short} → {to_short}: {ptype}{content}")
    
    print("\n" + "=" * 50)
    host = os.getenv('HOST', '0.0.0.0')
    port = os.getenv('PORT', '5000')
    # Show localhost for convenience when binding to all interfaces
    display_host = 'localhost' if host == '0.0.0.0' else host
    print(f"📡 Dashboard: http://{display_host}:{port}")
    print("🔄 Data updates automatically as packets arrive")

if __name__ == "__main__":
    show_database_status()
