# 🌐 Meshtastic Ground Control

A comprehensive real-time dashboard for visualizing Meshtastic mesh networks with both map-based node locations and network graph connections.

![Meshtastic Ground Control](https://img.shields.io/badge/Meshtastic-Ground%20Control-blue?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.8+-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## 🚀 Live Demo

**Try it now:** [https://meshtastic.ince.pt](https://meshtastic.ince.pt)

Experience Meshtastic Ground Control in action with live data from Portugal's Meshtastic network. The demo showcases real nodes, connections, and activity from the Portuguese mesh network, giving you a complete preview of all features including interactive maps, network graphs, enhanced tooltips, and URL sharing.

## 🤖 AI-Powered Development

This project showcases the power of AI-assisted software development - **95% of the codebase was written by artificial intelligence**. From the initial concept to the advanced features like enhanced tooltips and URL sharing, AI handled the vast majority of the implementation while maintaining proper documentation and modern best practices.

## Features

### 📍 Interactive Map View
- **OpenStreetMap Integration**: Displays node locations on a real map
- **Live Node Markers**: Shows nodes as they appear on the network with color-coded position quality
- **Enhanced Tooltips**: Rich hover tooltips with hardware images, device specs, and status info
- **Connection Lines**: Visual connections between nodes with thickness based on packet count
- **Node Popups**: Click nodes to see detailed information (battery, last seen, etc.)
- **Position Quality Indicators**: Green (confirmed GPS), Yellow (triangulated), Red (estimated)

### 🔗 Network Graph
- **Node-to-Node Visualization**: Interactive force-directed graph using vis.js
- **Enhanced Node Tooltips**: Rich hover tooltips matching the map view with hardware details
- **Connection Strength**: Edge thickness and labels show packet counts with detailed connection info
- **Real-time Updates**: Graph updates as new connections are discovered
- **Interactive**: Click and drag nodes, hover for details
- **Smart Popup Logic**: Shows popups only for nodes without confirmed positions

### � URL Sharing & Focus
- **Shareable Node Links**: Click any node to update the URL with `?node=nodeId` parameter
- **Direct Node Access**: Share URLs that automatically focus on specific nodes
- **Cross-View Synchronization**: Clicking nodes focuses both map and graph views
- **Loading Overlay**: Professional loading indicator during node focusing
- **Auto-Focus**: URLs with node parameters automatically center and highlight the specified node

### �📡 Live Activity Feed
- **Real-time Packet Stream**: Shows all decoded packets as they arrive
- **Color-coded Types**: Different colors for position, text, telemetry, etc.
- **Message Content**: Displays decoded message content when available

### 📊 Network Statistics
- **Live Stats**: Total nodes, connections, packets, and active nodes
- **Auto-refresh**: Updates every 10 seconds
- **Modular Architecture**: Separate stats module for clean code organization

### 🎨 Enhanced User Experience
- **Hardware Images**: Visual hardware identification with device images
- **Fullscreen Mode**: Toggle fullscreen for map or graph views
- **Interactive Search**: Search and filter nodes by ID or name
- **Responsive Design**: Works on desktop and mobile devices
- **Modern UI**: Dark theme with professional styling

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

The dashboard will be available at http://localhost:5000 (or the port specified by the `PORT` environment variable)

## Configuration

### Environment Variables

The application supports the following environment variables:

- `MQTT_BROKER` - MQTT broker hostname (required)
- `MQTT_USERNAME` - MQTT username (required)  
- `MQTT_PASSWORD` - MQTT password (required)
- `MQTT_TOPIC` - MQTT topic to subscribe to (required)
- `HOST` - Host/IP address to bind the web server to (optional, defaults to 0.0.0.0)
- `PORT` - Port for the web dashboard (optional, defaults to 5000)

You can set the host and port by adding them to your `.env` file:
```
HOST=127.0.0.1
PORT=8080
```

Or by setting them when running the application:
```bash
HOST=127.0.0.1 PORT=8080 uv run python run_dashboard.py
```

**Note:** Using `HOST=0.0.0.0` (default) binds to all network interfaces, making the dashboard accessible from other devices on your network. Use `HOST=127.0.0.1` or `HOST=localhost` to restrict access to the local machine only.

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

4. **Frontend Architecture**:
   - **Main Dashboard** (`static/js/dashboard.js`): Core application logic and URL management
   - **Map Module** (`static/js/map-view.js`): OpenStreetMap integration and marker management
   - **Graph Module** (`static/js/graph-view.js`): Network graph visualization with vis.js
   - **Stats Module** (`static/js/stats.js`): Real-time statistics and metrics
   - **Modern Responsive UI** (`templates/index.html`): Clean, professional interface

### Data Flow

```
MQTT Broker → MQTT Decoder → SQLite Database → Flask API → WebSocket → Frontend Modules
```

### Frontend Modules

- **Modular Architecture**: Clean separation of concerns across multiple JavaScript modules
- **Enhanced Tooltips**: Rich hardware information with device images and specifications
- **URL State Management**: Shareable links with node focus parameters
- **Real-time Synchronization**: WebSocket updates across all modules
- **Cross-Module Communication**: Coordinated updates between map, graph, and stats

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
- **Enhanced Tooltips**: Rich hover information with hardware images and detailed specs
- **URL Sharing**: Share direct links to specific nodes with `?node=nodeId` parameter
- **Connection Tracking**: Automatic connection discovery from packet routing
- **Signal Quality**: SNR/RSSI tracking for connection health
- **Activity Monitoring**: Real-time packet stream with decoded content
- **Cross-View Synchronization**: Click nodes to focus both map and graph simultaneously
- **Smart Loading**: Professional loading overlays during node focusing operations

## Hardware Support

The dashboard includes visual hardware identification with device images for:

- **Heltec Devices**: All Heltec LoRa modules and development boards
- **LILYGO T-Beam**: Various T-Beam models and variants
- **RAK Modules**: RAK4631 and other RAK Wireless devices
- **ESP32 Boards**: Various ESP32-based development boards
- **RP2040 Devices**: Raspberry Pi Pico and compatible boards
- **And many more**: Extensive hardware database with fallback images

## Usage Tips

### Sharing Node Links
1. Click any node on the map or graph
2. Copy the updated URL from your browser
3. Share the link with others to show them the specific node
4. Recipients will see the dashboard automatically focus on that node

### Understanding Position Quality
- **Green markers**: Confirmed GPS positions (most accurate)
- **Yellow markers**: Triangulated positions (estimated from multiple sources)
- **Red markers**: Estimated positions (least accurate)

### Graph Interactions
- **Hover over nodes**: See detailed hardware and status information
- **Click nodes**: Focus both map and graph on the selected node
- **Hover over edges**: See connection quality and packet statistics
- **Drag nodes**: Rearrange the graph layout manually

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
