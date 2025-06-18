// Global variables
let map, network, socket;
let nodes, edges;
let mapMarkers = {};
let connectionLines = {};
let pendingConnectionUpdates = new Set(); // Track nodes that need connection updates

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    // Setup search input event listener
    const searchInput = document.getElementById('nodeSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchNode();
            }
        });
    }
    
    // Setup modal close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeSearchModal();
        }
    });
    
    // Wait a bit for vis.js to load
    setTimeout(function() {
        console.log('Checking vis availability...');
        console.log('typeof vis:', typeof vis);
        
        if (typeof vis === 'undefined') {
            console.error('vis.js library is not available');
            document.getElementById('network').innerHTML = 
                '<div style="color: white; text-align: center; padding: 50px; font-size: 16px;">' +
                '⚠️ Network graph unavailable<br>' +
                '<small>vis.js library failed to load</small></div>';
        } else {
            console.log('vis.js is available, version:', vis.version);
            // Initialize vis DataSets
            nodes = new vis.DataSet();
            edges = new vis.DataSet();
            console.log('DataSets created');
        }
        
        // Initialize other components
        initializeMap();
        if (typeof vis !== 'undefined') {
            initializeNetwork();
        }
        initializeWebSocket();
        loadInitialData();
    }, 500);
});

function initializeMap() {
    // Initialize OpenStreetMap
    map = L.map('map').setView([39.4, -8.2], 8); // Portugal center
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Clear any existing markers
    mapMarkers = {};
    
    // Custom marker styles
    window.nodeMarkerStyles = {
        default: { color: '#4fd1c7', radius: 8 },
        active: { color: '#48bb78', radius: 10 },
        inactive: { color: '#a0aec0', radius: 6 }
    };
    
    // Add position quality legend
    addPositionQualityLegend();
}

function initializeNetwork() {
    // Check if vis is available
    if (typeof vis === 'undefined') {
        console.error('vis.js is not available for network initialization');
        document.getElementById('network').innerHTML = '<div style="color: white; text-align: center; padding: 50px;">Network graph unavailable - vis.js not loaded</div>';
        return;
    }
    
    // Initialize network graph
    const container = document.getElementById('network');
    const data = { nodes: nodes, edges: edges };
    const options = {
        nodes: {
            shape: 'dot',
            size: 16,
            font: {
                size: 12,
                color: '#ffffff'
            },
            borderWidth: 2,
            color: {
                border: '#4fd1c7',
                background: '#2d3748',
                highlight: {
                    border: '#4fd1c7',
                    background: '#4a5568'
                }
            }
        },
        edges: {
            width: 2,
            color: {
                color: '#4a5568',
                highlight: '#4fd1c7'
            },
            arrows: {
                to: { enabled: true, scaleFactor: 0.8 }
            },
            smooth: {
                enabled: true,
                type: 'continuous'
            }
        },
        physics: {
            enabled: true,
            stabilization: { iterations: 200 },
            barnesHut: {
                gravitationalConstant: -8000,
                springConstant: 0.001,
                springLength: 200
            }
        },
        interaction: {
            hover: true,
            tooltipDelay: 200
        }
    };
    
    network = new vis.Network(container, data, options);
    
    // Network event handlers
    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            highlightNode(nodeId);
        }
    });
}

function initializeWebSocket() {
    socket = io();
    
    socket.on('connect', function() {
        updateConnectionStatus(true);
        addLogEntry('system', 'Connected to dashboard server');
    });
    
    socket.on('disconnect', function() {
        updateConnectionStatus(false);
        addLogEntry('system', 'Disconnected from dashboard server');
    });
    
    socket.on('node_update', function(data) {
        updateNode(data);
        // Add node to pending updates for connection refresh
        pendingConnectionUpdates.add(data.node_id);
        // Debounce connection updates to avoid too many API calls
        clearTimeout(window.connectionUpdateTimeout);
        window.connectionUpdateTimeout = setTimeout(refreshPendingConnections, 500);
    });
    
    socket.on('packet_update', function(data) {
        handlePacketUpdate(data);
    });
}

function loadInitialData() {
    // Load all nodes (updateNode handles both graph and map)
    fetch('/api/nodes')
        .then(response => response.json())
        .then(data => {
            data.forEach(node => updateNode(node));
            // Auto-fit map to show all markers after loading
            setTimeout(() => {
                if (Object.keys(mapMarkers).length > 0) {
                    const group = new L.featureGroup(Object.values(mapMarkers));
                    map.fitBounds(group.getBounds().pad(0.1));
                }
            }, 100);
            
            // Load connections after nodes are loaded and markers are created
            return fetch('/api/connections');
        })
        .then(response => response.json())
        .then(data => {
            data.forEach(connection => updateConnection(connection));
            // Force redraw all map connections after both nodes and connections are loaded
            setTimeout(() => {
                redrawAllMapConnections();
            }, 200);
        })
        .catch(error => console.error('Error loading initial data:', error));
    
    // Load stats
    updateStats();
    setInterval(updateStats, 10000); // Update every 10 seconds
}

function ensureNodeExists(nodeId) {
    if (!nodeId || nodeId === 'ffffffff') return; // Skip invalid or broadcast IDs
    
    if (typeof vis !== 'undefined' && nodes && !nodes.get(nodeId)) {
        // Create placeholder node
        const placeholderNode = {
            id: nodeId,
            label: nodeId.slice(-4), // Show last 4 characters
            title: `Node ID: ${nodeId}\nStatus: Unknown`,
            color: {
                border: '#a0aec0',
                background: '#e2e8f0',
                highlight: {
                    border: '#718096',
                    background: '#cbd5e0'
                }
            }
        };
        
        nodes.add(placeholderNode);
    }
}

function updateNode(nodeData) {
    const nodeId = nodeData.node_id;
    const hasPosition = nodeData.latitude != null && nodeData.longitude != null && 
                       nodeData.latitude !== '' && nodeData.longitude !== '' &&
                       !isNaN(nodeData.latitude) && !isNaN(nodeData.longitude);
    
    // Determine node color based on position quality
    let nodeColor;
    if (hasPosition) {
        const positionQuality = nodeData.position_quality || 'unknown';
        switch (positionQuality) {
            case 'confirmed':
                // Green for confirmed GPS positions
                nodeColor = {
                    border: '#38a169',
                    background: '#48bb78',
                    highlight: {
                        border: '#2f855a',
                        background: '#68d391'
                    }
                };
                break;
            case 'triangulated':
                // Yellow for triangulated positions (3+ points)
                nodeColor = {
                    border: '#d69e2e',
                    background: '#ecc94b',
                    highlight: {
                        border: '#b7791f',
                        background: '#f6e05e'
                    }
                };
                break;
            case 'estimated':
                // Red for estimated positions (2 points)
                nodeColor = {
                    border: '#c53030',
                    background: '#e53e3e',
                    highlight: {
                        border: '#9b2c2c',
                        background: '#fc8181'
                    }
                };
                break;
            default:
                // Default color for unknown quality (shouldn't appear on map)
                nodeColor = undefined;
        }
    }
    
    // Always update network graph node (show all nodes in graph)
    if (typeof vis !== 'undefined' && nodes) {
        const networkNode = {
            id: nodeId,
            label: nodeData.short_name || nodeData.long_name || nodeId.slice(-4),
            title: `${nodeData.long_name || 'Unknown'}\nID: ${nodeId}\nPosition Quality: ${nodeData.position_quality || 'unknown'}\nLast seen: ${nodeData.last_seen || 'Never'}`,
            color: nodeColor
        };
        
        if (nodes.get(nodeId)) {
            nodes.update(networkNode);
        } else {
            nodes.add(networkNode);
        }
    }
    
    // Update map marker only if node has position
    if (hasPosition) {
        updateMapMarker(nodeData);
    }
    
    // Check if any existing connections can now draw map lines
    redrawMapConnectionsForNode(nodeId);
    
    addLogEntry('nodeinfo', `Node ${nodeData.short_name || nodeId.slice(-4)} updated`);
}

function updateMapMarker(nodeData) {
    const nodeId = nodeData.node_id;
    const lat = nodeData.latitude;
    const lon = nodeData.longitude;
    
    if (!lat || !lon || !map || lat == null || lon == null || 
        lat === '' || lon === '' || isNaN(lat) || isNaN(lon)) {
        return; // Skip if no valid coordinates or map not ready
    }
    
    if (mapMarkers[nodeId]) {
        // Update existing marker position
        mapMarkers[nodeId].setLatLng([lat, lon]);
        
        // Update popup and tooltip content
        const popupContent = `
            <div style="font-family: 'Segoe UI', sans-serif; min-width: 200px;">
                <div style="font-weight: bold; font-size: 14px; color: #2d3748; margin-bottom: 8px;">
                    ${nodeData.long_name || nodeData.short_name || 'Unknown Node'}
                </div>
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>ID:</strong> !${nodeId}
                </div>
                ${nodeData.short_name && nodeData.long_name !== nodeData.short_name ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Short Name:</strong> ${nodeData.short_name}
                </div>` : ''}
                ${nodeData.hardware_model ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Hardware:</strong> ${nodeData.hardware_model}
                </div>` : ''}
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Position:</strong> ${lat.toFixed(6)}, ${lon.toFixed(6)}
                </div>
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Position Quality:</strong> 
                    <span style="color: ${(nodeData.position_quality === 'confirmed' ? '#38a169' : 
                        nodeData.position_quality === 'triangulated' ? '#d69e2e' : 
                        nodeData.position_quality === 'estimated' ? '#c53030' : '#718096')};">
                        ${nodeData.position_quality === 'confirmed' ? 'GPS Confirmed' : 
                          nodeData.position_quality === 'triangulated' ? 'Triangulated (3+ points)' : 
                          nodeData.position_quality === 'estimated' ? 'Estimated (2 points)' : 
                          'Unknown'}
                    </span>
                </div>
                ${nodeData.altitude ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Altitude:</strong> ${nodeData.altitude}m
                </div>` : ''}
                ${nodeData.battery_level ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Battery:</strong> ${nodeData.battery_level}%
                </div>` : ''}
                ${nodeData.voltage ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Voltage:</strong> ${nodeData.voltage}V
                </div>` : ''}
                ${nodeData.snr ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>SNR:</strong> ${nodeData.snr} dB
                </div>` : ''}
                ${nodeData.rssi ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>RSSI:</strong> ${nodeData.rssi} dBm
                </div>` : ''}
                ${nodeData.last_seen ? `
                <div style="font-size: 12px; color: #4a5568; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0;">
                    <strong>Last seen:</strong> ${new Date(nodeData.last_seen).toLocaleString()}
                </div>` : ''}
            </div>
        `;
        
        const tooltipContent = `
            <div style="font-family: 'Segoe UI', sans-serif; font-size: 12px; max-width: 250px;">
                <div style="font-weight: bold; margin-bottom: 4px;">
                    ${nodeData.long_name || nodeData.short_name || 'Unknown Node'}
                </div>
                <div style="color: #666; margin-bottom: 2px;">ID: !${nodeId}</div>
                ${nodeData.hardware_model ? `<div style="color: #666; margin-bottom: 2px;">${nodeData.hardware_model}</div>` : ''}
                ${nodeData.battery_level ? `<div style="color: #666; margin-bottom: 2px;">Battery: ${nodeData.battery_level}%</div>` : ''}
                ${nodeData.last_seen ? `<div style="color: #666; font-size: 11px;">Last seen: ${new Date(nodeData.last_seen).toLocaleString()}</div>` : ''}
            </div>
        `;
        
        mapMarkers[nodeId].setPopupContent(popupContent);
        mapMarkers[nodeId].setTooltipContent(tooltipContent);
    } else {
        // Determine marker color based on position quality
        let markerColor = '#4fd1c7'; // Default teal
        const positionQuality = nodeData.position_quality || 'unknown';
        
        switch (positionQuality) {
            case 'confirmed':
                markerColor = '#48bb78'; // Green for confirmed GPS positions
                break;
            case 'triangulated':
                markerColor = '#ecc94b'; // Yellow for triangulated positions (3+ points)
                break;
            case 'estimated':
                markerColor = '#e53e3e'; // Red for estimated positions (2 points)
                break;
            default:
                markerColor = '#4fd1c7'; // Default teal (shouldn't appear)
        }
        
        const marker = L.circleMarker([lat, lon], {
            radius: 8,
            fillColor: markerColor,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);
        
        // Create detailed popup content
        const popupContent = `
            <div style="font-family: 'Segoe UI', sans-serif; min-width: 200px;">
                <div style="font-weight: bold; font-size: 14px; color: #2d3748; margin-bottom: 8px;">
                    ${nodeData.long_name || nodeData.short_name || 'Unknown Node'}
                </div>
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>ID:</strong> !${nodeId}
                </div>
                ${nodeData.short_name && nodeData.long_name !== nodeData.short_name ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Short Name:</strong> ${nodeData.short_name}
                </div>` : ''}
                ${nodeData.hardware_model ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Hardware:</strong> ${nodeData.hardware_model}
                </div>` : ''}
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Position:</strong> ${lat.toFixed(6)}, ${lon.toFixed(6)}
                </div>
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Position Quality:</strong> 
                    <span style="color: ${(positionQuality === 'confirmed' ? '#38a169' : 
                        positionQuality === 'triangulated' ? '#d69e2e' : 
                        positionQuality === 'estimated' ? '#c53030' : '#718096')};">
                        ${positionQuality === 'confirmed' ? 'GPS Confirmed' : 
                          positionQuality === 'triangulated' ? 'Triangulated (3+ points)' : 
                          positionQuality === 'estimated' ? 'Estimated (2 points)' : 
                          'Unknown'}
                    </span>
                </div>
                ${nodeData.altitude ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Altitude:</strong> ${nodeData.altitude}m
                </div>` : ''}
                ${nodeData.battery_level ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Battery:</strong> ${nodeData.battery_level}%
                </div>` : ''}
                ${nodeData.voltage ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>Voltage:</strong> ${nodeData.voltage}V
                </div>` : ''}
                ${nodeData.snr ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>SNR:</strong> ${nodeData.snr} dB
                </div>` : ''}
                ${nodeData.rssi ? `
                <div style="font-size: 12px; color: #4a5568; margin-bottom: 4px;">
                    <strong>RSSI:</strong> ${nodeData.rssi} dBm
                </div>` : ''}
                ${nodeData.last_seen ? `
                <div style="font-size: 12px; color: #4a5568; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0;">
                    <strong>Last seen:</strong> ${new Date(nodeData.last_seen).toLocaleString()}
                </div>` : ''}
            </div>
        `;
        
        // Create hover tooltip content (more concise)
        const tooltipContent = `
            <div style="font-family: 'Segoe UI', sans-serif; font-size: 12px; max-width: 250px;">
                <div style="font-weight: bold; margin-bottom: 4px;">
                    ${nodeData.long_name || nodeData.short_name || 'Unknown Node'}
                </div>
                <div style="color: #666; margin-bottom: 2px;">ID: !${nodeId}</div>
                ${nodeData.hardware_model ? `<div style="color: #666; margin-bottom: 2px;">${nodeData.hardware_model}</div>` : ''}
                ${nodeData.battery_level ? `<div style="color: #666; margin-bottom: 2px;">Battery: ${nodeData.battery_level}%</div>` : ''}
                ${nodeData.last_seen ? `<div style="color: #666; font-size: 11px;">Last seen: ${new Date(nodeData.last_seen).toLocaleString()}</div>` : ''}
            </div>
        `;
        
        // Bind popup (click to open)
        marker.bindPopup(popupContent);
        
        // Bind tooltip (hover to show)
        marker.bindTooltip(tooltipContent, {
            permanent: false,
            direction: 'top',
            offset: [0, -10],
            opacity: 0.9,
            className: 'custom-tooltip'
        });
        
        // Add click event to focus on node in graph
        marker.on('click', function() {
            focusOnNodeInGraph(nodeId);
        });
        
        // Add hover effects
        marker.on('mouseover', function(e) {
            this.setStyle({
                radius: 10,
                weight: 3,
                fillOpacity: 1
            });
        });
        
        marker.on('mouseout', function(e) {
            this.setStyle({
                radius: 8,
                weight: 2,
                fillOpacity: 0.8
            });
        });
        
        mapMarkers[nodeId] = marker;
    }
    
    // Check if any existing connections can now draw map lines
    redrawMapConnectionsForNode(nodeId);
}

function redrawMapConnectionsForNode(nodeId) {
    // Look through all existing edges in the network to find connections involving this node
    if (typeof vis !== 'undefined' && edges) {
        const allEdges = edges.get();
        allEdges.forEach(edge => {
            if (edge.from === nodeId || edge.to === nodeId) {
                const fromMarker = mapMarkers[edge.from];
                const toMarker = mapMarkers[edge.to];
                
                if (fromMarker && toMarker) {
                    const edgeId = edge.id;
                    
                    // Only create line if it doesn't exist yet
                    if (!connectionLines[edgeId]) {
                        const line = L.polyline([
                            fromMarker.getLatLng(),
                            toMarker.getLatLng()
                        ], {
                            color: '#4fd1c7',
                            weight: 2,
                            opacity: 0.7
                        }).addTo(map);
                        
                        line.bindPopup(`
                            <b>Connection</b><br>
                            From: ${edge.from.slice(-4)}<br>
                            To: ${edge.to.slice(-4)}<br>
                            ${edge.title || ''}
                        `);
                        
                        connectionLines[edgeId] = line;
                    }
                }
            }
        });
    }
}

function redrawAllMapConnections() {
    // Get all edges from the network graph and redraw map connections
    if (typeof vis !== 'undefined' && edges) {
        const allEdges = edges.get();
        allEdges.forEach(edge => {
            const fromMarker = mapMarkers[edge.from];
            const toMarker = mapMarkers[edge.to];
            
            if (fromMarker && toMarker) {
                const edgeId = edge.id;
                
                // Remove existing line if it exists
                if (connectionLines[edgeId]) {
                    map.removeLayer(connectionLines[edgeId]);
                }
                
                // Create new connection line
                const line = L.polyline([
                    fromMarker.getLatLng(),
                    toMarker.getLatLng()
                ], {
                    color: '#4fd1c7',
                    weight: 2,
                    opacity: 0.7
                }).addTo(map);
                
                line.bindPopup(`
                    Connection: ${edge.from.slice(-4)} → ${edge.to.slice(-4)}<br>
                    ${edge.title || 'No additional info'}
                `);
                
                connectionLines[edgeId] = line;
            }
        });
    }
}

function focusOnNodeInGraph(nodeId) {
    if (typeof vis !== 'undefined' && network && nodes) {
        // Check if the node exists in the graph
        const node = nodes.get(nodeId);
        if (node) {
            // Focus on the node with animation
            network.focus(nodeId, {
                scale: 1.0,
                animation: {
                    duration: 500,
                    easingFunction: 'easeInOutQuad'
                }
            });
            
            // Select the node to highlight it
            network.selectNodes([nodeId]);
        }
    }
}

function updateConnection(connectionData) {
    const edgeId = `${connectionData.from_node}-${connectionData.to_node}`;
    
    // Ensure both nodes exist (create placeholders if needed)
    ensureNodeExists(connectionData.from_node);
    ensureNodeExists(connectionData.to_node);
    
    // Update network graph edge (only if vis.js is available)
    if (typeof vis !== 'undefined' && edges) {
        const edge = {
            id: edgeId,
            from: connectionData.from_node,
            to: connectionData.to_node,
            label: `${connectionData.packet_count}`,
            title: `Packets: ${connectionData.packet_count}\nAvg SNR: ${connectionData.avg_snr?.toFixed(1) || 'N/A'}\nAvg RSSI: ${connectionData.avg_rssi || 'N/A'}`
        };
        
        if (edges.get(edgeId)) {
            edges.update(edge);
        } else {
            edges.add(edge);
        }
    }
    
    // Update map connection line
    const fromMarker = mapMarkers[connectionData.from_node];
    const toMarker = mapMarkers[connectionData.to_node];
    
    if (fromMarker && toMarker) {
        const lineId = edgeId;
        
        if (connectionLines[lineId]) {
            map.removeLayer(connectionLines[lineId]);
        }
        
        const line = L.polyline([
            fromMarker.getLatLng(),
            toMarker.getLatLng()
        ], {
            color: '#4fd1c7',
            weight: Math.min(connectionData.packet_count / 10 + 1, 5),
            opacity: 0.6
        }).addTo(map);
        
        line.bindPopup(`
            Connection: ${connectionData.from_node.slice(-4)} → ${connectionData.to_node.slice(-4)}<br>
            Packets: ${connectionData.packet_count}<br>
            Avg SNR: ${connectionData.avg_snr?.toFixed(1) || 'N/A'}<br>
            Last seen: ${new Date(connectionData.last_seen).toLocaleString()}
        `);
        
        connectionLines[lineId] = line;
    }
}

function handlePacketUpdate(packetData) {
    const type = packetData.payload_type || 'unknown';
    const from = packetData.from_node?.slice(-4) || 'Unknown';
    const to = packetData.to_node?.slice(-4) || 'Broadcast';
    
    let message = `${from} → ${to}: ${type}`;
    if (packetData.payload_data) {
        try {
            const payload = JSON.parse(packetData.payload_data);
            if (payload.message) {
                message += ` "${payload.message}"`;
            } else if (payload.latitude && payload.longitude) {
                message += ` (${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)})`;
            }
        } catch (e) {
            // Ignore parsing errors
        }
    }
    
    addLogEntry(type, message);
}

function updateStats() {
    fetch('/api/stats')
        .then(response => response.json())
        .then(stats => {
            document.getElementById('stat-nodes').textContent = stats.total_nodes || 0;
            document.getElementById('stat-connections').textContent = stats.active_connections || 0;
            document.getElementById('stat-packets').textContent = stats.recent_packets || 0;
            document.getElementById('stat-active').textContent = stats.nodes_with_position || 0;
        })
        .catch(error => console.error('Error updating stats:', error));
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    if (connected) {
        statusElement.textContent = 'Connected';
        statusElement.className = 'connection-status connected';
    } else {
        statusElement.textContent = 'Disconnected';
        statusElement.className = 'connection-status disconnected';
    }
}

function addLogEntry(type, message) {
    const logContent = document.getElementById('log-content');
    const timestamp = new Date().toLocaleTimeString();
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `
        <span class="timestamp">[${timestamp}]</span> ${message}
    `;
    
    logContent.insertBefore(entry, logContent.firstChild);
    
    // Keep only last 100 entries
    while (logContent.children.length > 100) {
        logContent.removeChild(logContent.lastChild);
    }
}

function highlightNode(nodeId) {
    // Highlight node on map
    if (mapMarkers[nodeId]) {
        mapMarkers[nodeId].openPopup();
        map.setView(mapMarkers[nodeId].getLatLng(), 12);
    }
}

// Search functionality
async function searchNode() {
    const input = document.getElementById('nodeSearchInput');
    const modal = document.getElementById('searchModal');
    const resultsDiv = document.getElementById('searchResults');
    const searchTerm = input.value.trim();
    
    if (!searchTerm) {
        alert('Please enter a node ID to search');
        return;
    }
    
    // Show modal and loading message
    modal.style.display = 'block';
    resultsDiv.innerHTML = '<div class="search-message">🔍 Searching...</div>';
    
    try {
        // Search for the node
        const nodeResponse = await fetch(`/api/search/node/${encodeURIComponent(searchTerm)}`);
        
        if (!nodeResponse.ok) {
            if (nodeResponse.status === 404) {
                resultsDiv.innerHTML = '<div class="search-message">❌ Node not found</div>';
            } else {
                resultsDiv.innerHTML = '<div class="search-message">❌ Error searching for node</div>';
            }
            return;
        }
        
        const nodeData = await nodeResponse.json();
        
        // Get packets for this node
        const packetsResponse = await fetch(`/api/packets/node/${encodeURIComponent(searchTerm)}`);
        let packets = [];
        if (packetsResponse.ok) {
            packets = await packetsResponse.json();
        }
        
        // Display results
        displaySearchResults(nodeData, packets);
        
        // Highlight the node on map and graph
        highlightSearchedNode(nodeData.node_id);
        
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<div class="search-message">❌ Error occurred during search</div>';
    }
}

function closeSearchModal() {
    const modal = document.getElementById('searchModal');
    modal.style.display = 'none';
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    const modal = document.getElementById('searchModal');
    if (event.target === modal) {
        closeSearchModal();
    }
}

function displaySearchResults(nodeData, packets) {
    const resultsDiv = document.getElementById('searchResults');
    
    // Format node information
    const hasPosition = nodeData.latitude && nodeData.longitude;
    const lastSeen = nodeData.last_seen ? new Date(nodeData.last_seen).toLocaleString() : 'Never';
    
    let nodeInfo = `
        <div class="search-result-section">
            <h3>🔍 Node Details</h3>
            <div class="node-details">
                <div class="detail-row">
                    <span class="detail-label">ID:</span>
                    <span class="detail-value">!${nodeData.node_id}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Long Name:</span>
                    <span class="detail-value">${nodeData.long_name || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Short Name:</span>
                    <span class="detail-value">${nodeData.short_name || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Hardware:</span>
                    <span class="detail-value">${nodeData.hardware_model || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Position:</span>
                    <span class="detail-value">${hasPosition ? 
                        `${nodeData.latitude.toFixed(6)}, ${nodeData.longitude.toFixed(6)}` : 
                        'No position data'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Last Seen:</span>
                    <span class="detail-value">${lastSeen}</span>
                </div>
                ${nodeData.battery_level ? `
                <div class="detail-row">
                    <span class="detail-label">Battery:</span>
                    <span class="detail-value">${nodeData.battery_level}%</span>
                </div>` : ''}
                ${nodeData.snr ? `
                <div class="detail-row">
                    <span class="detail-label">SNR:</span>
                    <span class="detail-value">${nodeData.snr} dB</span>
                </div>` : ''}
                ${nodeData.rssi ? `
                <div class="detail-row">
                    <span class="detail-label">RSSI:</span>
                    <span class="detail-value">${nodeData.rssi} dBm</span>
                </div>` : ''}
            </div>
        </div>
    `;
    
    // Format recent packets/messages
    let packetsInfo = `
        <div class="search-result-section">
            <h3>📡 Recent Messages (Last 24 Hours)</h3>
            <div class="packets-list">
    `;
    
    if (packets.length === 0) {
        packetsInfo += '<div class="no-packets">No messages found in the last 24 hours</div>';
    } else {
        packets.forEach(packet => {
            const timestamp = new Date(packet.timestamp).toLocaleString();
            const portTypeMap = {
                '1': 'TEXT_MESSAGE_APP',
                '3': 'POSITION_APP',
                '4': 'NODEINFO_APP',
                '67': 'TELEMETRY_APP',
                '71': 'NEIGHBORINFO_APP'
            };
            const portName = portTypeMap[packet.port_num] || `Port ${packet.port_num}`;
            
            packetsInfo += `
                <div class="packet-item">
                    <div class="packet-header">
                        <span class="packet-time">${timestamp}</span>
                        <span class="packet-type">${portName}</span>
                    </div>
                    <div class="packet-route">
                        From: <strong>!${packet.from_node}</strong> → To: <strong>!${packet.to_node}</strong>
                        ${packet.gateway_id && packet.gateway_id !== packet.from_node && packet.gateway_id !== packet.to_node ? 
                            ` via <strong>!${packet.gateway_id}</strong>` : ''}
                    </div>
                    ${packet.channel ? `<div class="packet-channel">Channel: ${packet.channel}</div>` : ''}
                    ${(packet.snr || packet.rssi) ? `
                        <div class="packet-signal">
                            ${packet.snr ? `SNR: ${packet.snr} dB ` : ''}
                            ${packet.rssi ? `RSSI: ${packet.rssi} dBm` : ''}
                        </div>
                    ` : ''}
                    ${packet.payload_data && packet.port_num === '1' ? `
                        <div class="packet-payload">${packet.payload_data}</div>
                    ` : ''}
                </div>
            `;
        });
    }
    
    packetsInfo += '</div></div>';
    
    resultsDiv.innerHTML = nodeInfo + packetsInfo;
}

function highlightSearchedNode(nodeId) {
    // Highlight on map if node has position
    if (mapMarkers[nodeId]) {
        mapMarkers[nodeId].openPopup();
        map.setView(mapMarkers[nodeId].getLatLng(), 12);
    }
    
    // Highlight on network graph
    if (network && nodes) {
        const nodeExists = nodes.get(nodeId);
        if (nodeExists) {
            network.selectNodes([nodeId]);
            network.focus(nodeId, {
                scale: 1.5,
                animation: {
                    duration: 1000,
                    easingFunction: 'easeInOutQuad'
                }
            });
        }
    }
}

function refreshPendingConnections() {
    if (pendingConnectionUpdates.size === 0) return;
    
    const nodeIds = Array.from(pendingConnectionUpdates).join(',');
    console.log('Refreshing connections for nodes:', nodeIds);
    pendingConnectionUpdates.clear();
    
    // Fetch connections for the updated nodes using query parameter
    fetch(`/api/connections?nodes=${nodeIds}`)
        .then(response => response.json())
        .then(connections => {
            console.log(`Found ${connections.length} connections for nodes ${nodeIds}`);
            connections.forEach(connection => updateConnection(connection));
        })
        .catch(error => console.error('Error fetching connections for nodes:', error));
}

// Function to trigger position triangulation
// Function to add position quality legend
function addPositionQualityLegend() {
    if (!map) return;
    
    const legend = L.control({ position: 'bottomright' });
    
    legend.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'position-legend');
        div.style.backgroundColor = 'rgba(45, 55, 72, 0.95)';
        div.style.color = '#ffffff';
        div.style.padding = '10px';
        div.style.borderRadius = '6px';
        div.style.fontSize = '12px';
        div.style.fontFamily = "'Segoe UI', sans-serif";
        div.style.border = '1px solid #4a5568';
        
        div.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px; text-align: center;">Position Quality</div>
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
                <div style="width: 12px; height: 12px; background-color: #48bb78; border-radius: 50%; margin-right: 8px;"></div>
                <span>GPS Confirmed</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
                <div style="width: 12px; height: 12px; background-color: #ecc94b; border-radius: 50%; margin-right: 8px;"></div>
                <span>Triangulated (3+ points)</span>
            </div>
            <div style="display: flex; align-items: center;">
                <div style="width: 12px; height: 12px; background-color: #e53e3e; border-radius: 50%; margin-right: 8px;"></div>
                <span>Estimated (2 points)</span>
            </div>
        `;
        
        return div;
    };
    
    legend.addTo(map);
}
