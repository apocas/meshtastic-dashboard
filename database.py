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
            
            # Drop old connections table if it exists (migration)
            conn.execute('DROP TABLE IF EXISTS connections')
            
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
        """Get connections derived from packets with valid SNR/RSSI"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute('''
                SELECT 
                    from_node,
                    CASE 
                        WHEN gateway_id IS NOT NULL 
                             AND gateway_id != from_node 
                             AND gateway_id != to_node 
                        THEN gateway_id 
                        ELSE to_node 
                    END as to_node,
                    COUNT(*) as packet_count,
                    AVG(rx_snr) as avg_snr,
                    AVG(rx_rssi) as avg_rssi,
                    MAX(timestamp) as last_seen
                FROM packets 
                WHERE rx_snr IS NOT NULL 
                    AND rx_rssi IS NOT NULL 
                    AND rx_snr != 0 
                    AND rx_rssi != 0
                    AND from_node != to_node
                    AND to_node != 'ffffffff'
                    AND datetime(timestamp) > datetime('now', '-24 hours')
                GROUP BY from_node, 
                    CASE 
                        WHEN gateway_id IS NOT NULL 
                             AND gateway_id != from_node 
                             AND gateway_id != to_node 
                        THEN gateway_id 
                        ELSE to_node 
                    END
                HAVING packet_count >= 1
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

    def get_node_by_id(self, node_id):
        """Get a specific node by ID"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            result = conn.execute('SELECT * FROM nodes WHERE node_id = ?', (node_id,)).fetchone()
            return dict(result) if result else None
    
    def get_packets_by_node(self, node_id, hours=24):
        """Get packets involving a specific node from the last N hours"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            # Get packets where the node is either sender, receiver, or gateway
            return [dict(row) for row in conn.execute('''
                SELECT * FROM packets 
                WHERE (from_node = ? OR to_node = ? OR gateway_id = ?)
                AND timestamp >= datetime('now', '-{} hours')
                ORDER BY timestamp DESC
            '''.format(hours), (node_id, node_id, node_id)).fetchall()]
    
    def get_total_packet_count(self):
        """Get total count of all packets in the database"""
        with sqlite3.connect(self.db_path) as conn:
            return conn.execute('SELECT COUNT(*) FROM packets').fetchone()[0]
