import sqlite3
import json
from datetime import datetime
import threading
import math

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
                    position_quality TEXT DEFAULT 'unknown',
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
            
            # Add position_quality column if it doesn't exist (for existing databases)
            try:
                conn.execute('ALTER TABLE nodes ADD COLUMN position_quality TEXT DEFAULT \'unknown\'')
                conn.execute('UPDATE nodes SET position_quality = \'confirmed\' WHERE latitude IS NOT NULL AND longitude IS NOT NULL')
            except sqlite3.OperationalError:
                # Column already exists, ignore
                pass
            
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
                needs_triangulation = False
                
                if existing:
                    # Node exists, update only the provided fields
                    update_fields = []
                    update_values = []
                    
                    for field in ['long_name', 'short_name', 'hardware_model', 'latitude', 'longitude', 'altitude', 
                                  'battery_level', 'voltage', 'snr', 'rssi', 'channel', 'firmware_version', 'role', 'is_licensed']:
                        if field in node_data and node_data[field] is not None:
                            update_fields.append(f"{field} = ?")
                            update_values.append(node_data[field])
                    
                    # Set position quality if coordinates are provided
                    if 'latitude' in node_data and 'longitude' in node_data:
                        if node_data['latitude'] is not None and node_data['longitude'] is not None:
                            update_fields.append("position_quality = ?")
                            update_values.append('confirmed')
                    
                    # Always update last_seen
                    update_fields.append("last_seen = ?")
                    update_values.append(datetime.now())
                    update_values.append(node_id)  # for WHERE clause
                    
                    if update_fields:
                        query = f"UPDATE nodes SET {', '.join(update_fields)} WHERE node_id = ?"
                        conn.execute(query, update_values)
                        
                        # Log position updates
                        if 'latitude' in node_data or 'longitude' in node_data:
                            print(f"[📍] Updated position for {node_id}: lat={node_data.get('latitude')}, lon={node_data.get('longitude')}")
                else:
                    # Node doesn't exist, insert new record
                    position_quality = 'confirmed' if (node_data.get('latitude') is not None and node_data.get('longitude') is not None) else 'unknown'
                    
                    conn.execute('''
                        INSERT INTO nodes (
                            node_id, long_name, short_name, hardware_model,
                            latitude, longitude, altitude, position_quality, last_seen,
                            battery_level, voltage, snr, rssi, channel,
                            firmware_version, role, is_licensed
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        node_data.get('node_id'),
                        node_data.get('long_name'),
                        node_data.get('short_name'),
                        node_data.get('hardware_model'),
                        node_data.get('latitude'),
                        node_data.get('longitude'),
                        node_data.get('altitude'),
                        position_quality,
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
                
                # Check if new node needs triangulation (without confirmed position)
                needs_triangulation = (node_data.get('latitude') is None or 
                                     node_data.get('longitude') is None)
                
        # For new nodes, attempt triangulation after the database transaction is complete
        if not existing and needs_triangulation:
            self.triangulate_single_node(node_id)
            
        # For existing nodes, check if triangulation is needed after the transaction
        elif existing:
            # Get updated node info to check if triangulation is needed
            with sqlite3.connect(self.db_path) as conn:
                updated_node = conn.execute('SELECT latitude, longitude, position_quality FROM nodes WHERE node_id = ?', (node_id,)).fetchone()
                if updated_node:
                    lat, lon, quality = updated_node
                    # Try triangulation if node doesn't have a confirmed position
                    if (lat is None or lon is None or quality != 'confirmed'):
                        self.triangulate_single_node(node_id)
    
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
    
    def get_connections(self, from_node=None, to_node=None, nodes=None, hours=72):
        """Get direct RF connections between nodes based on actual radio reception
        
        A connection represents direct RF communication where:
        - One node transmitted (from_node)
        - Another node received it directly via RF (gateway_id with SNR/RSSI)
        - This indicates the nodes are within RF range of each other
        
        Args:
            from_node: Optional filter for specific transmitting node
            to_node: Optional filter for specific receiving node  
            nodes: Optional list of nodes to filter connections involving any of them
            hours: Timeframe in hours to look back (default: 72)
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            # Build the base query - focus on direct RF reception
            base_query = f'''
                SELECT 
                    CASE 
                        WHEN from_node LIKE '!%' THEN SUBSTR(from_node, 2)
                        ELSE from_node 
                    END as from_node,
                    CASE 
                        WHEN gateway_id LIKE '!%' THEN SUBSTR(gateway_id, 2)
                        ELSE gateway_id 
                    END as to_node,
                    COUNT(*) as packet_count,
                    AVG(rx_snr) as avg_snr,
                    AVG(rx_rssi) as avg_rssi,
                    MAX(timestamp) as last_seen,
                    MIN(rx_snr) as min_snr,
                    MAX(rx_snr) as max_snr,
                    MIN(rx_rssi) as min_rssi,
                    MAX(rx_rssi) as max_rssi
                FROM packets 
                WHERE 
                    -- Must have RF reception data (indicates direct reception)
                    rx_snr IS NOT NULL 
                    AND rx_rssi IS NOT NULL 
                    AND rx_snr != 0 
                    AND rx_rssi != 0
                    -- Must have a gateway_id (the actual receiving node)
                    AND gateway_id IS NOT NULL
                    AND gateway_id != ''
                    -- Sender and receiver must be different
                    AND from_node != gateway_id
                    -- Exclude broadcast packets
                    AND to_node != 'ffffffff'
                    -- Recent packets only (configurable timeframe)
                    AND datetime(timestamp) > datetime('now', '-{hours} hours')
                    -- Exclude diagnostic packets
                    AND (payload_type IS NULL OR payload_type != 'traceroute')
                    -- Focus on packets likely to indicate neighbor relationships
                    AND (
                        payload_type IN ('nodeinfo', 'position', 'telemetry', 'text') 
                        OR payload_type IS NULL
                        OR portnum IN (1, 3, 4, 67)  -- NODEINFO, POSITION, ADMIN, TELEMETRY
                    )
            '''
            
            # Add optional filters
            query_params = []
            
            if nodes is not None and len(nodes) > 0:
                # Filter for connections involving any of the specified nodes
                placeholders = ','.join(['?' for _ in nodes])
                base_query += f''' AND (
                    from_node IN ({placeholders}) OR 
                    gateway_id IN ({placeholders})
                )'''
                query_params.extend(nodes * 2)  # Add nodes list 2 times for the 2 conditions
            else:
                # Use individual node filters if nodes list is not provided
                if from_node is not None:
                    base_query += ' AND from_node = ?'
                    query_params.append(from_node)
                
                if to_node is not None:
                    base_query += ' AND gateway_id = ?'
                    query_params.append(to_node)
            
            # Complete the query - group by actual RF sender and receiver
            base_query += '''
                GROUP BY 
                    CASE 
                        WHEN from_node LIKE '!%' THEN SUBSTR(from_node, 2)
                        ELSE from_node 
                    END,
                    CASE 
                        WHEN gateway_id LIKE '!%' THEN SUBSTR(gateway_id, 2)
                        ELSE gateway_id 
                    END
                HAVING packet_count >= 2  -- Require multiple packets for reliable connection
                ORDER BY packet_count DESC, last_seen DESC
            '''
            
            return [dict(row) for row in conn.execute(base_query, query_params).fetchall()]
    
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
    
    def get_node_neighbors(self, node_id):
        """Get all neighboring nodes (both as sender and receiver) with connection details"""
        connections = self.get_connections(nodes=[node_id])
        neighbors = []
        
        # Get the requesting node's position for GPS distance calculation
        requesting_node = self.get_node_by_id(node_id)
        requesting_has_gps = (requesting_node and 
                             requesting_node.get('latitude') is not None and 
                             requesting_node.get('longitude') is not None and
                             requesting_node.get('position_quality') == 'confirmed')
        
        for conn in connections:
            neighbor_id = None
            if conn['from_node'] == node_id:
                neighbor_id = conn['to_node']
            elif conn['to_node'] == node_id:
                neighbor_id = conn['from_node']
            
            if neighbor_id:
                neighbor_node = self.get_node_by_id(neighbor_id)
                if neighbor_node:
                    # Determine the best distance estimate
                    distance_estimate = self._estimate_distance_from_rssi(conn.get('avg_rssi', 0))
                    distance_method = 'rssi'
                    
                    # Use GPS distance if both nodes have confirmed GPS positions
                    neighbor_has_gps = (neighbor_node.get('latitude') is not None and 
                                       neighbor_node.get('longitude') is not None and
                                       neighbor_node.get('position_quality') == 'confirmed')
                    
                    if requesting_has_gps and neighbor_has_gps:
                        gps_distance = self._haversine_distance(
                            requesting_node['latitude'], requesting_node['longitude'],
                            neighbor_node['latitude'], neighbor_node['longitude']
                        )
                        distance_estimate = gps_distance
                        distance_method = 'gps'
                    
                    neighbor_data = {
                        'node': neighbor_node,
                        'connection': conn,
                        'distance_estimate': distance_estimate,
                        'distance_method': distance_method
                    }
                    neighbors.append(neighbor_data)
        
        return neighbors
    
    def _estimate_distance_from_rssi(self, rssi, tx_power=-10):
        """Estimate distance in meters from RSSI using path loss formula
        
        Args:
            rssi: Received Signal Strength Indicator in dBm
            tx_power: Transmit power in dBm (LoRa typical is around -10 to 20 dBm)
        
        Returns:
            Estimated distance in meters
        """
        if rssi == 0 or rssi is None:
            return 10000  # Unknown distance, set high value
        
        # Free space path loss formula (simplified)
        # RSSI = Tx Power - (20 * log10(distance) + 20 * log10(frequency) + 32.44)
        # For 915 MHz: frequency factor = 20 * log10(915) + 32.44 ≈ 92.4
        # Rearranging: distance = 10^((Tx Power - RSSI - 92.4) / 20)
        
        path_loss = tx_power - rssi
        if path_loss <= 0:
            return 1  # Very close
        
        # Simplified formula for 915MHz band
        distance = 10 ** ((path_loss - 32.44) / 20)
        return max(1, min(distance, 50000))  # Clamp between 1m and 50km
    
    def _haversine_distance(self, lat1, lon1, lat2, lon2):
        """Calculate the great circle distance between two points in meters"""
        R = 6371000  # Earth's radius in meters
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = (math.sin(delta_lat / 2) ** 2 + 
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def _trilaterate(self, points):
        """Trilaterate position from multiple reference points
        
        For 2 points: Use midpoint between the two positions
        For 3+ points: Use geometric center (centroid) of all positions
        
        Args:
            points: List of dicts with keys: 'lat', 'lon', 'distance' (distance is ignored)
        
        Returns:
            Dict with 'lat', 'lon' if successful, None if failed
        """
        if len(points) < 2:
            return None
        
        if len(points) == 2:
            # For 2 points, return midpoint (less accurate)
            lat1, lon1 = points[0]['lat'], points[0]['lon']
            lat2, lon2 = points[1]['lat'], points[1]['lon']
            
            return {
                'lat': (lat1 + lat2) / 2,
                'lon': (lon1 + lon2) / 2,
                'quality': 'estimated'
            }
        
        # For 3+ points, use geometric center (centroid) of all positions
        total_lat = sum(point['lat'] for point in points)
        total_lon = sum(point['lon'] for point in points)
        count = len(points)
        
        return {
            'lat': total_lat / count,
            'lon': total_lon / count,
            'quality': 'triangulated'
        }
    
     
    def triangulate_single_node(self, node_id):
        """Attempt to triangulate position for a single node
        
        Args:
            node_id: The ID of the node to triangulate
            
        Returns:
            Dict with result info or None if failed
        """
        try:
            # Get the node to check if it already has a position
            node = self.get_node_by_id(node_id)
            if not node:
                return None
                
            # Skip if node already has a confirmed position
            if (node.get('latitude') is not None and 
                node.get('longitude') is not None and 
                node.get('position_quality') == 'confirmed'):
                return None
                
            # Get neighbors with confirmed positions
            neighbors = self.get_node_neighbors(node_id)
            positioned_neighbors = []
            gps_distance_count = 0
            
            for neighbor_data in neighbors:
                neighbor = neighbor_data['node']
                if (neighbor.get('latitude') is not None and 
                    neighbor.get('longitude') is not None and
                    neighbor.get('position_quality') == 'confirmed'):
                    
                    positioned_neighbors.append({
                        'lat': neighbor['latitude'],
                        'lon': neighbor['longitude'],
                        'distance': neighbor_data['distance_estimate'],
                        'distance_method': neighbor_data.get('distance_method', 'rssi')
                    })
                    
                    if neighbor_data.get('distance_method') == 'gps':
                        gps_distance_count += 1
            
            if len(positioned_neighbors) >= 2:
                # Attempt triangulation with improved quality assessment
                result = self._trilaterate(positioned_neighbors)
                
                if result:
                    # Simplified quality based on number of reference points
                    if len(positioned_neighbors) >= 3:
                        result['quality'] = 'triangulated'  # 3+ points
                    else:
                        result['quality'] = 'estimated'  # 2 points only
                
                if result:
                    # Update node position in a separate transaction
                    try:
                        with self.lock:
                            with sqlite3.connect(self.db_path) as conn:
                                conn.execute('''
                                    UPDATE nodes 
                                    SET latitude = ?, longitude = ?, position_quality = ?
                                    WHERE node_id = ?
                                ''', (result['lat'], result['lon'], result['quality'], node_id))
                                conn.commit()
                        
                        print(f"[📍] Auto-triangulated position for {node_id}: "
                              f"lat={result['lat']:.6f}, lon={result['lon']:.6f}, "
                              f"quality={result['quality']}")
                        
                        return {
                            'success': True,
                            'lat': result['lat'],
                            'lon': result['lon'],
                            'quality': result['quality'],
                            'reference_points': len(positioned_neighbors)
                        }
                    except Exception as db_error:
                        print(f"[❌] Database error during triangulation for {node_id}: {db_error}")
                        return None
            
            return None
            
        except Exception as e:
            print(f"[❌] Error during triangulation for {node_id}: {e}")
            return None
    
    def search_nodes(self, search_term):
        """Search for nodes by partial match in node_id, long_name, or short_name"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            # Search in node_id, long_name, and short_name
            search_pattern = f'%{search_term}%'
            
            return [dict(row) for row in conn.execute('''
                SELECT node_id, long_name, short_name, latitude, longitude, position_quality, last_seen
                FROM nodes 
                WHERE node_id LIKE ? 
                   OR long_name LIKE ? 
                   OR short_name LIKE ?
                ORDER BY 
                    CASE 
                        WHEN node_id = ? THEN 1
                        WHEN node_id LIKE ? THEN 2
                        WHEN long_name LIKE ? THEN 3
                        WHEN short_name LIKE ? THEN 4
                        ELSE 5
                    END,
                    last_seen DESC
                LIMIT 10
            ''', (search_pattern, search_pattern, search_pattern, 
                  search_term, f'{search_term}%', f'{search_term}%', f'{search_term}%')).fetchall()]
