# 🌐 Meshtastic Network Dashboard

A comprehensive real-time dashboard for visualizing Meshtastic mesh networks with both map-based node locations and network graph connections.

## Features

### 📍 Interactive Map View
- **OpenStreetMap Integration**: Displays node locations on a real map
- **Live Node Markers**: Shows nodes as they appear on the network
- **Connection Lines**: Visual connections between nodes with thickness based on packet count
- **Node Popups**: Click nodes to see detailed information (battery, last seen, etc.)

### 🔗 Network Graph
- **Node-to-Node Visualization**: Interactive force-directed graph using vis.js
- **Connection Strength**: Edge thickness and labels show packet counts
- **Real-time Updates**: Graph updates as new connections are discovered
- **Interactive**: Click and drag nodes, hover for details

### 📡 Live Activity Feed
- **Real-time Packet Stream**: Shows all decoded packets as they arrive
- **Color-coded Types**: Different colors for position, text, telemetry, etc.
- **Message Content**: Displays decoded message content when available

### 📊 Network Statistics
- **Live Stats**: Total nodes, connections, packets, and active nodes
- **Auto-refresh**: Updates every 10 seconds

## Setup

### 1. Environment Configuration

Create a `.env` file with your MQTT broker details:

```bash
MQTT_BROKER=mqtt.meshtastic.org
MQTT_PORT=1883
MQTT_TOPIC=msh/#
MQTT_USERNAME=meshdev
MQTT_PASSWORD=large4cats
MQTT_KEEPALIVE=60
MQTT_CLIENT_ID=meshtastic_dashboard
FLASK_SECRET_KEY=your_secret_key_here
```

### 2. Install Dependencies

```bash
uv sync
```

### 3. Initialize with Demo Data (Optional)

To see the dashboard in action with sample data:

```bash
uv run python create_demo_data.py
```

### 4. Start the Dashboard

```bash
uv run python run_dashboard.py
```

The dashboard will be available at http://localhost:5000

## Architecture

### Components

1. **MQTT Decoder** (`main.py`): 
   - Connects to Meshtastic MQTT broker
   - Decrypts encrypted packets using AES-CTR
   - Parses all Meshtastic protobuf message types
   - Stores data in SQLite database

2. **Web Backend** (`app.py`):
   - Flask web server with REST API
   - WebSocket support for real-time updates
   - Serves the dashboard frontend

3. **Database** (`database.py`):
   - SQLite schema for nodes, packets, and connections
   - Thread-safe operations
   - Automatic connection tracking

4. **Frontend** (`templates/index.html`):
   - Modern responsive web interface
   - OpenStreetMap integration with Leaflet.js
   - Network graph with vis.js
   - Real-time updates via WebSocket

### Data Flow

```
MQTT Broker → MQTT Decoder → SQLite Database → Flask API → WebSocket → Frontend
```

## Supported Message Types

The decoder supports all major Meshtastic message types:

- **📍 Position**: GPS coordinates, altitude, precision
- **👤 Node Info**: Device names, hardware models, roles
- **📱 Telemetry**: Battery, voltage, channel utilization, environmental sensors
- **💬 Text Messages**: Plain text communications
- **🧭 Waypoints**: Named locations and POIs
- **🔍 Neighbor Info**: Direct node-to-node connections
- **🗺️ Map Reports**: Comprehensive node status reports
- **🛣️ Traceroute**: Network path discovery

## Database Schema

### Nodes Table
- Node ID, names, hardware info
- Position (lat/lon/altitude)
- Battery and signal metrics
- Last seen timestamp

### Packets Table
- Complete packet metadata
- Decoded payload data
- Routing information
- Reception metrics (SNR/RSSI)

### Connections Table
- Source and destination nodes
- Packet counts and averages
- Signal quality metrics
- Last activity timestamps

## Real-time Features

- **Live Node Discovery**: New nodes appear immediately on map and graph
- **Connection Tracking**: Automatic connection discovery from packet routing
- **Signal Quality**: SNR/RSSI tracking for connection health
- **Activity Monitoring**: Real-time packet stream with decoded content

## Development

### Adding New Message Types

1. Add decoder logic in `decode_port_payload()` function
2. Update `process_decoded_payload()` for database storage
3. Add frontend handling in the JavaScript code

### Customizing the Map

Edit the map initialization in `templates/index.html`:
```javascript
map = L.map('map').setView([39.4, -8.2], 8); // Set your preferred center and zoom
```

### Database Customization

Modify the schema in `database.py` and update the corresponding frontend code to display new fields.

## Troubleshooting

### MQTT Connection Issues
- Verify broker URL and credentials in `.env`
- Check firewall settings for port 1883/8883
- Ensure topic permissions are correct

### Decryption Problems
- Default key is included for the public Meshtastic network
- For private networks, update the key in `decrypt_payload()`
- Check that the nonce generation matches your network's implementation

### Performance
- The system handles thousands of packets efficiently
- Database auto-cleans old data to prevent bloat
- WebSocket updates are throttled to prevent UI overload

## License

This project is open source and available under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.
