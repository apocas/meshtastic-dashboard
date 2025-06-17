import sqlite3
import json
from datetime import datetime
import threading

class MeshtasticDB:
    def __init__(self, db_path="meshtastic.db"):
        self.db_path = db_path
        self.lock = threading.Lock()
        self.init_database()
    
    def init_database(self):
        """Initialize the database with required tables"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS nodes (
                    node_id TEXT PRIMARY KEY,
                    long_name TEXT,
                    short_name TEXT,
                    hardware_model INTEGER,
                    latitude REAL,
                    longitude REAL,
                    altitude REAL,
                    last_seen TIMESTAMP,
                    battery_level INTEGER,
                    voltage REAL,
                    snr REAL,
                    rssi INTEGER,
                    channel INTEGER,
                    firmware_version TEXT,
                    role INTEGER,
                    is_licensed BOOLEAN
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS packets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    packet_id TEXT,
                    from_node TEXT,
                    to_node TEXT,
                    portnum INTEGER,
                    channel INTEGER,
                    hop_limit INTEGER,
                    want_ack BOOLEAN,
                    rx_time TIMESTAMP,
                    rx_snr REAL,
                    rx_rssi INTEGER,
                    payload_type TEXT,
                    payload_data TEXT,
                    gateway_id TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS connections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_node TEXT,
                    to_node TEXT,
                    last_seen TIMESTAMP,
                    packet_count INTEGER DEFAULT 1,
                    avg_snr REAL,
                    avg_rssi REAL,
                    UNIQUE(from_node, to_node)
                )
            ''')
            
            conn.commit()
    
    def update_node(self, node_data):
        """Update or insert node data"""
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                node_id = node_data.get('node_id')
                if not node_id:
                    return
                
                # Check if node exists
                existing = conn.execute('SELECT * FROM nodes WHERE node_id = ?', (node_id,)).fetchone()
                
                if existing:
                    # Node exists, update only the provided fields
                    update_fields = []
                    update_values = []
                    
                    for field in ['long_name', 'short_name', 'hardware_model', 'latitude', 'longitude', 'altitude', 
                                  'battery_level', 'voltage', 'snr', 'rssi', 'channel', 'firmware_version', 'role', 'is_licensed']:
                        if field in node_data and node_data[field] is not None:
                            update_fields.append(f"{field} = ?")
                            update_values.append(node_data[field])
                    
                    # Always update last_seen
                    update_fields.append("last_seen = ?")
                    update_values.append(datetime.now())
                    update_values.append(node_id)  # for WHERE clause
                    
                    if update_fields:
                        query = f"UPDATE nodes SET {', '.join(update_fields)} WHERE node_id = ?"
                        conn.execute(query, update_values)
                        
                        # Log position updates
                        if 'latitude' in node_data or 'longitude' in node_data:
                            print(f"[�] Updated position for {node_id}: lat={node_data.get('latitude')}, lon={node_data.get('longitude')}")
                else:
                    # Node doesn't exist, insert new record
                    conn.execute('''
                        INSERT INTO nodes (
                            node_id, long_name, short_name, hardware_model,
                            latitude, longitude, altitude, last_seen,
                            battery_level, voltage, snr, rssi, channel,
                            firmware_version, role, is_licensed
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        node_data.get('node_id'),
                        node_data.get('long_name'),
                        node_data.get('short_name'),
                        node_data.get('hardware_model'),
                        node_data.get('latitude'),
                        node_data.get('longitude'),
                        node_data.get('altitude'),
                        datetime.now(),
                        node_data.get('battery_level'),
                        node_data.get('voltage'),
                        node_data.get('snr'),
                        node_data.get('rssi'),
                        node_data.get('channel'),
                        node_data.get('firmware_version'),
                        node_data.get('role'),
                        node_data.get('is_licensed')
                    ))
                
                conn.commit()
    
    def add_packet(self, packet_data):
        """Add packet data"""
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    INSERT INTO packets (
                        packet_id, from_node, to_node, portnum, channel,
                        hop_limit, want_ack, rx_time, rx_snr, rx_rssi,
                        payload_type, payload_data, gateway_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    packet_data.get('packet_id'),
                    packet_data.get('from_node'),
                    packet_data.get('to_node'),
                    packet_data.get('portnum'),
                    packet_data.get('channel'),
                    packet_data.get('hop_limit'),
                    packet_data.get('want_ack'),
                    packet_data.get('rx_time'),
                    packet_data.get('rx_snr'),
                    packet_data.get('rx_rssi'),
                    packet_data.get('payload_type'),
                    json.dumps(packet_data.get('payload_data', {})),
                    packet_data.get('gateway_id')
                ))
                conn.commit()
    
    def update_connection(self, from_node, to_node, snr=None, rssi=None):
        """Update connection between nodes"""
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                # Check if connection exists
                result = conn.execute('''
                    SELECT packet_count, avg_snr, avg_rssi FROM connections 
                    WHERE from_node = ? AND to_node = ?
                ''', (from_node, to_node)).fetchone()
                
                if result:
                    # Update existing connection
                    count, avg_snr, avg_rssi = result
                    new_count = count + 1
                    new_avg_snr = ((avg_snr or 0) * count + (snr or 0)) / new_count if snr else avg_snr
                    new_avg_rssi = ((avg_rssi or 0) * count + (rssi or 0)) / new_count if rssi else avg_rssi
                    
                    conn.execute('''
                        UPDATE connections SET 
                        last_seen = ?, packet_count = ?, avg_snr = ?, avg_rssi = ?
                        WHERE from_node = ? AND to_node = ?
                    ''', (datetime.now(), new_count, new_avg_snr, new_avg_rssi, from_node, to_node))
                else:
                    # Insert new connection
                    conn.execute('''
                        INSERT INTO connections (from_node, to_node, last_seen, avg_snr, avg_rssi)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (from_node, to_node, datetime.now(), snr, rssi))
                
                conn.commit()
    
    def get_nodes(self):
        """Get all nodes"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute('''
                SELECT * FROM nodes 
                ORDER BY last_seen DESC
            ''').fetchall()]
    
    def get_nodes_with_position(self):
        """Get only nodes that have coordinates"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute('''
                SELECT * FROM nodes 
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                ORDER BY last_seen DESC
            ''').fetchall()]
    
    def get_connections(self):
        """Get all connections"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute('''
                SELECT * FROM connections 
                WHERE datetime(last_seen) > datetime('now', '-1 hour')
                ORDER BY last_seen DESC
            ''').fetchall()]
    
    def get_recent_packets(self, limit=100):
        """Get recent packets"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute('''
                SELECT * FROM packets 
                ORDER BY timestamp DESC 
                LIMIT ?
            ''', (limit,)).fetchall()]
