// Global variables
let map, network, socket;
let nodes, edges;
let mapMarkers = {};
let connectionLines = {};
let pendingConnectionUpdates = new Set(); // Track nodes that need connection updates

// Global variables for mapping data
let hardwareModels = {};
let modemPresets = {};
let regionCodes = {};
let roles = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    // Initialize interactive search functionality
    initializeSearch();
    
    // Setup modal close and fullscreen exit on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Check if in fullscreen mode first
            const fullscreenElement = document.querySelector('.fullscreen-mode');
            if (fullscreenElement) {
                const viewType = fullscreenElement.classList.contains('map-container') ? 'map' : 'graph';
                toggleFullscreen(viewType);
            } else {
                // Otherwise close search modal
                closeSearchModal();
            }
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
        loadMappingData();
        loadInitialData();
    }, 500);
});

function initializeMap() {
    // Initialize OpenStreetMap
    map = L.map('map').setView([39.4, -8.2], 8); // Portugal center
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Create separate layer groups to control z-order
    // Connection layer first (will be below)
    window.connectionLayer = L.layerGroup().addTo(map);
    // Marker layer second (will be on top)
    window.markerLayer = L.layerGroup().addTo(map);
    
    // Explicitly set z-index to ensure proper layering
    if (window.connectionLayer.getPane) {
        map.createPane('connectionPane');
        map.getPane('connectionPane').style.zIndex = 400;
        window.connectionLayer.options.pane = 'connectionPane';
    }
    
    if (window.markerLayer.getPane) {
        map.createPane('markerPane');
        map.getPane('markerPane').style.zIndex = 450;
        window.markerLayer.options.pane = 'markerPane';
    }
    
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
            showNodePopup(nodeId);
            // Also focus the node on the map if it has a position
            focusOnNodeInMap(nodeId);
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
        // New approach: data only contains node_id, fetch fresh data from API
        const nodeId = data.node_id;
        if (!nodeId) {
            console.error('Received node_update without node_id:', data);
            return;
        }
        
        console.log('Node update received for:', nodeId);
        
        // Fetch fresh node data from the API
        fetch(`/api/search/node/${nodeId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(nodeData => {
                console.log('Fresh node data fetched for:', nodeId, nodeData);
                updateNode(nodeData);
                // Add node to pending updates for connection refresh
                pendingConnectionUpdates.add(nodeId);
                // Debounce connection updates to avoid too many API calls
                clearTimeout(window.connectionUpdateTimeout);
                window.connectionUpdateTimeout = setTimeout(refreshPendingConnections, 500);
            })
            .catch(error => {
                console.error('Error fetching fresh node data for', nodeId, ':', error);
            });
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
            const timeframeSelect = document.getElementById('timeframeSelect');
            const selectedHours = timeframeSelect ? timeframeSelect.value : '48';
            return fetch(`/api/connections?hours=${selectedHours}`);
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
            label: nodeId, // Show full node ID
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
    
    // Debug logging for all node data to understand the issue
    console.log('updateNode called for:', nodeId, nodeData);
    
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
        // Helper function to decode Unicode escape sequences
        function decodeUnicodeEscapes(str) {
            if (!str || typeof str !== 'string') return str;
            try {
                // Replace Unicode escape sequences with actual characters
                // Handle both single and double backslash escapes
                return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
                    return String.fromCharCode(parseInt(code, 16));
                });
            } catch (e) {
                return str; // Return original if decoding fails
            }
        }
        
        // Decode Unicode in names
        const decodedShortName = decodeUnicodeEscapes(nodeData.short_name);
        const decodedLongName = decodeUnicodeEscapes(nodeData.long_name);
        
        const networkNode = {
            id: nodeId,
            label: nodeId,
            title: `${decodedLongName || 'Unknown'}\nID: ${nodeId}\nPosition Quality: ${nodeData.position_quality || 'unknown'}\nLast seen: ${nodeData.last_seen || 'Never'}`,
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
        
        const tooltipContent = generateEnhancedTooltip(nodeData, nodeId);
        
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
            fillOpacity: 0.8,
            pane: 'markerPane'
        }).addTo(window.markerLayer);
        
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
        const tooltipContent = generateEnhancedTooltip(nodeData, nodeId);
        
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
                            opacity: 0.7,
                            pane: 'connectionPane'
                        }).addTo(window.connectionLayer);
                        
                        line.bindPopup(`
                            <b>Connection</b><br>
                            From: ${edge.from.slice(-4)}<br>
                            To: ${edge.to.slice(-4)}<br>
                            ${edge.title ? edge.title.replace(/\n/g, '<br>') : ''}
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
                    window.connectionLayer.removeLayer(connectionLines[edgeId]);
                }
                
                // Create new connection line
                const line = L.polyline([
                    fromMarker.getLatLng(),
                    toMarker.getLatLng()
                ], {
                    color: '#4fd1c7',
                    weight: 2,
                    opacity: 0.7,
                    pane: 'connectionPane'
                }).addTo(window.connectionLayer);
                
                line.bindPopup(`
                    Connection: ${edge.from.slice(-4)} → ${edge.to.slice(-4)}<br>
                    ${edge.title ? edge.title.replace(/\n/g, '<br>') : 'No additional info'}
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

function focusOnNodeInMap(nodeId) {
    // Focus on node in map view without opening popup
    if (mapMarkers[nodeId]) {
        map.setView(mapMarkers[nodeId].getLatLng(), 14);
        // Briefly highlight the marker
        const marker = mapMarkers[nodeId];
        const originalIcon = marker.getIcon();
        
        // Create a temporary highlighted version
        if (marker._icon) {
            marker._icon.style.filter = 'drop-shadow(0 0 10px #ffff00)';
            setTimeout(() => {
                marker._icon.style.filter = '';
            }, 2000);
        }
    }
}

function updateConnection(connectionData) {
    const edgeId = `${connectionData.from_node}-${connectionData.to_node}`;
    
    // Ensure both nodes exist (create placeholders if needed)
    // Remove leading "!" if present
    const fromNodeId = connectionData.from_node.startsWith('!') ? connectionData.from_node.substring(1) : connectionData.from_node;
    const toNodeId = connectionData.to_node.startsWith('!') ? connectionData.to_node.substring(1) : connectionData.to_node;
    
    ensureNodeExists(fromNodeId);
    ensureNodeExists(toNodeId);
    
    // Update network graph edge (only if vis.js is available)
    if (typeof vis !== 'undefined' && edges) {
        const edge = {
            id: edgeId,
            from: fromNodeId,
            to: toNodeId,
            label: `${connectionData.packet_count}`,
            title: `Packets: ${connectionData.packet_count}\nAvg SNR: ${connectionData.avg_snr?.toFixed(1) || 'N/A'}\nAvg RSSI: ${connectionData.avg_rssi || 'N/A'}\nLast seen: ${new Date(connectionData.last_seen).toLocaleString()}`
        };
        
        if (edges.get(edgeId)) {
            edges.update(edge);
        } else {
            edges.add(edge);
        }
    }
    
    // Update map connection line
    const fromMarker = mapMarkers[fromNodeId];
    const toMarker = mapMarkers[toNodeId];
    
    if (fromMarker && toMarker) {
        const lineId = edgeId;
        
        if (connectionLines[lineId]) {
            window.connectionLayer.removeLayer(connectionLines[lineId]);
        }
        
        const line = L.polyline([
            fromMarker.getLatLng(),
            toMarker.getLatLng()
        ], {
            color: '#4fd1c7',
            weight: Math.min(connectionData.packet_count / 10 + 1, 5),
            opacity: 0.6,
            pane: 'connectionPane'
        }).addTo(window.connectionLayer);
        
        line.bindPopup(`
            Connection: ${fromNodeId} → ${toNodeId}<br>
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
    // Get the current timeframe
    const timeframeSelect = document.getElementById('timeframeSelect');
    const selectedHours = timeframeSelect ? timeframeSelect.value : 48;
    
    fetch(`/api/stats?hours=${selectedHours}`)
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

// Interactive search functionality
function initializeSearch() {
    const searchInput = document.getElementById('nodeSearchInput');
    const searchDropdown = document.getElementById('searchDropdown');
    let searchTimeout;
    
    // Live search as user types
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim();
        
        // Clear previous timeout
        clearTimeout(searchTimeout);
        
        if (searchTerm.length < 2) {
            hideSearchDropdown();
            return;
        }
        
        // Debounce search by 300ms
        searchTimeout = setTimeout(() => {
            performLiveSearch(searchTerm);
        }, 300);
    });
    
    // Handle Enter key
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const firstResult = searchDropdown.querySelector('.search-result-item[data-node-id]');
            if (firstResult) {
                selectSearchResult(firstResult.dataset.nodeId);
            }
        } else if (e.key === 'Escape') {
            hideSearchDropdown();
        }
    });
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) {
            hideSearchDropdown();
        }
    });
}

async function performLiveSearch(searchTerm) {
    const searchDropdown = document.getElementById('searchDropdown');
    
    try {
        const response = await fetch(`/api/search/nodes?q=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
            hideSearchDropdown();
            return;
        }
        
        const results = await response.json();
        displaySearchDropdown(results);
        
    } catch (error) {
        console.error('Live search error:', error);
        hideSearchDropdown();
    }
}

function displaySearchDropdown(results) {
    const searchDropdown = document.getElementById('searchDropdown');
    
    if (results.length === 0) {
        searchDropdown.innerHTML = '<div class="search-result-item"><div class="search-result-secondary">No results found</div></div>';
        searchDropdown.style.display = 'block';
        return;
    }
    
    // Helper function to decode Unicode escape sequences
    function decodeUnicodeEscapes(str) {
        if (!str || typeof str !== 'string') return str;
        try {
            return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
                return String.fromCharCode(parseInt(code, 16));
            });
        } catch (e) {
            return str;
        }
    }
    
    const html = results.map(node => {
        const decodedLongName = decodeUnicodeEscapes(node.long_name);
        const decodedShortName = decodeUnicodeEscapes(node.short_name);
        
        const primaryText = decodedLongName || decodedShortName || node.node_id;
        const secondaryText = decodedShortName && decodedLongName !== decodedShortName ? decodedShortName : '';
        const hasPosition = node.latitude != null && node.longitude != null;
        const positionText = hasPosition ? `📍 ${node.position_quality || 'positioned'}` : '📍 no position';
        
        return `
            <div class="search-result-item" data-node-id="${node.node_id}" onclick="selectSearchResult('${node.node_id}')">
                <div class="search-result-primary">${primaryText}</div>
                ${secondaryText ? `<div class="search-result-secondary">${secondaryText}</div>` : ''}
                <div class="search-result-tertiary">ID: ${node.node_id} • ${positionText}</div>
            </div>
        `;
    }).join('');
    
    searchDropdown.innerHTML = html;
    searchDropdown.style.display = 'block';
}

function hideSearchDropdown() {
    const searchDropdown = document.getElementById('searchDropdown');
    searchDropdown.style.display = 'none';
}

function selectSearchResult(nodeId) {
    const searchInput = document.getElementById('nodeSearchInput');
    
    // Set the input value to the selected node ID
    searchInput.value = nodeId;
    
    // Hide dropdown
    hideSearchDropdown();
    
    // Focus on the node in both graph and map
    focusOnNodeInGraph(nodeId);
    focusOnNodeInMap(nodeId);
    
    // Show node popup
    showNodePopup(nodeId);
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

// Function to show node popup with detailed information
function showNodePopup(nodeId) {
    // Get node data
    const nodeData = nodes.get(nodeId);
    if (!nodeData) {
        console.error('Node not found:', nodeId);
        return;
    }
    
    // Get full node details from nodes collection or fetch if needed
    fetch(`/api/search/node/${nodeId}`)
        .then(response => response.json())
        .then(fullNodeData => {
            // Helper function to decode Unicode escape sequences
            function decodeUnicodeEscapes(str) {
                if (!str || typeof str !== 'string') return str;
                try {
                    // Replace Unicode escape sequences with actual characters
                    // Handle both single and double backslash escapes
                    return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
                        return String.fromCharCode(parseInt(code, 16));
                    });
                } catch (e) {
                    return str; // Return original if decoding fails
                }
            }
            
            // Decode Unicode in names
            fullNodeData.long_name = decodeUnicodeEscapes(fullNodeData.long_name);
            fullNodeData.short_name = decodeUnicodeEscapes(fullNodeData.short_name);
            
            const hasPosition = fullNodeData.latitude != null && fullNodeData.longitude != null && 
                               fullNodeData.latitude !== '' && fullNodeData.longitude !== '' &&
                               !isNaN(fullNodeData.latitude) && !isNaN(fullNodeData.longitude);
            
            const positionQuality = fullNodeData.position_quality || 'unknown';
            const needsTriangulation = !hasPosition || (hasPosition && positionQuality !== 'confirmed');
            
            // Create popup content
            const modalTitle = document.getElementById('nodeModalTitle');
            const modalContent = document.getElementById('nodeModalContent');
            
            modalTitle.textContent = fullNodeData.long_name || fullNodeData.short_name || 'Unknown Node';
            
            modalContent.innerHTML = `
                <div style="font-family: 'Segoe UI', sans-serif;">
                    <div style="margin-bottom: 16px;">
                        <div style="font-size: 14px; color: #e2e8f0; margin-bottom: 8px;">
                            <strong>Node ID:</strong> !${nodeId.replace(/^!+/, '')}
                        </div>
                        ${fullNodeData.short_name && fullNodeData.long_name !== fullNodeData.short_name ? `
                        <div style="font-size: 14px; color: #e2e8f0; margin-bottom: 8px;">
                            <strong>Short Name:</strong> ${fullNodeData.short_name}
                        </div>` : ''}
                        ${fullNodeData.hardware_model ? `
                        <div style="font-size: 14px; color: #e2e8f0; margin-bottom: 8px;">
                            <strong>Hardware:</strong> ${fullNodeData.hardware_model}
                        </div>` : ''}
                    </div>
                    
                    ${hasPosition ? `
                    <div style="margin-bottom: 16px; padding: 12px; background-color: rgba(72, 187, 120, 0.1); border-radius: 6px; border-left: 4px solid #48bb78;">
                        <div style="font-size: 14px; color: #e2e8f0; margin-bottom: 8px;">
                            <strong>Position:</strong> ${fullNodeData.latitude.toFixed(6)}, ${fullNodeData.longitude.toFixed(6)}
                        </div>
                        <div style="font-size: 14px; color: #e2e8f0; margin-bottom: 8px;">
                            <strong>Quality:</strong> 
                            <span style="color: ${positionQuality === 'confirmed' ? '#68d391' : positionQuality === 'triangulated' ? '#ecc94b' : positionQuality === 'estimated' ? '#fc8181' : '#a0aec0'};">
                                ${positionQuality === 'confirmed' ? 'GPS Confirmed' : 
                                  positionQuality === 'triangulated' ? 'Triangulated (3+ points)' : 
                                  positionQuality === 'estimated' ? 'Estimated (2 points)' : 
                                  'Unknown'}
                            </span>
                        </div>
                        ${fullNodeData.altitude ? `
                        <div style="font-size: 14px; color: #e2e8f0;">
                            <strong>Altitude:</strong> ${fullNodeData.altitude}m
                        </div>` : ''}
                    </div>` : `
                    <div style="margin-bottom: 16px; padding: 12px; background-color: rgba(237, 137, 54, 0.1); border-radius: 6px; border-left: 4px solid #ed8936;">
                        <div style="font-size: 14px; color: #fbd38d;">
                            <strong>⚠️ No Position Data</strong>
                        </div>
                        <div style="font-size: 12px; color: #e2e8f0; margin-top: 4px;">
                            This node's location is unknown
                        </div>
                    </div>`}
                    
                    <div style="margin-bottom: 16px;">
                        ${fullNodeData.battery_level ? `
                        <div style="font-size: 14px; color: #e2e8f0, margin-bottom: 8px;">
                            <strong>Battery:</strong> ${fullNodeData.battery_level}%
                        </div>` : ''}
                        ${fullNodeData.voltage ? `
                        <div style="font-size: 14px; color: #e2e8f0, margin-bottom: 8px;">
                            <strong>Voltage:</strong> ${fullNodeData.voltage}V
                        </div>` : ''}
                        ${fullNodeData.snr ? `
                        <div style="font-size: 14px; color: #e2e8f0, margin-bottom: 8px;">
                            <strong>SNR:</strong> ${fullNodeData.snr} dB
                        </div>` : ''}
                        ${fullNodeData.rssi ? `
                        <div style="font-size: 14px; color: #e2e8f0, margin-bottom: 8px;">
                            <strong>RSSI:</strong> ${fullNodeData.rssi} dBm
                        </div>` : ''}
                    </div>
                    
                    ${fullNodeData.last_seen ? `
                    <div style="margin-bottom: 16px; padding-top: 12px; border-top: 1px solid #4a5568;">
                        <div style="font-size: 14px; color: #e2e8f0;">
                            <strong>Last Seen:</strong> ${new Date(fullNodeData.last_seen).toLocaleString()}
                        </div>
                    </div>` : ''}
                    
                    ${needsTriangulation ? `
                    <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #4a5568;">
                        <button 
                            onclick="triangulateNode('${nodeId}')" 
                            style="
                                background-color: #ecc94b; 
                                color: #1a202c; 
                                border: none; 
                                padding: 8px 16px; 
                                border-radius: 4px; 
                                cursor: pointer; 
                                font-weight: 600;
                                width: 100%;
                                transition: background-color 0.2s;
                            "
                            onmouseover="this.style.backgroundColor='#d69e2e'"
                            onmouseout="this.style.backgroundColor='#ecc94b'"
                        >
                            📍 Try to Triangulate Position
                        </button>
                    </div>` : ''}
                </div>
            `;
            
            // Show the modal
            document.getElementById('nodeModal').style.display = 'block';
        })
        .catch(error => {
            console.error('Error fetching node details:', error);
            // Show basic info from network data
            const modalTitle = document.getElementById('nodeModalTitle');
            const modalContent = document.getElementById('nodeModalContent');
            
            modalTitle.textContent = nodeData.label || 'Unknown Node';
            modalContent.innerHTML = `
                <div style="font-family: 'Segoe UI', sans-serif;">
                    <div style="font-size: 14px; color: #e2e8f0; margin-bottom: 8px;">
                        <strong>Node ID:</strong> !${nodeId}
                    </div>
                    <div style="font-size: 14px; color: #fc8181; margin-top: 16px;">
                        ⚠️ Could not load detailed node information
                    </div>
                </div>
            `;
            document.getElementById('nodeModal').style.display = 'block';
        });
}

// Function to close node popup
function closeNodeModal() {
    document.getElementById('nodeModal').style.display = 'none';
}

// Function to triangulate a specific node
function triangulateNode(nodeId) {
    const button = event.target;
    const originalText = button.textContent;
    
    button.disabled = true;
    button.textContent = '⏳ Triangulating...';
    button.style.backgroundColor = '#a0aec0';
    button.style.cursor = 'not-allowed';
    
    // Make API call to manually triangulate this specific node
    fetch(`/api/nodes/${nodeId}/triangulate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`✅ Success!\n\n${data.message}\n\nQuality: ${data.result.quality}\nReference points: ${data.result.reference_points}`);
            
            // Close the modal and refresh the view
            closeNodeModal();
            
            // Refresh nodes to show the updated position
            setTimeout(() => {
                loadNodes();
            }, 500);
        } else {
            alert(`❌ Triangulation failed:\n\n${data.message}`);
        }
    })
    .catch(error => {
        console.error('Error during triangulation:', error);
        alert('❌ Error during triangulation: ' + error.message);
    })
    .finally(() => {
        button.disabled = false;
        button.textContent = originalText;
        button.style.backgroundColor = '#ecc94b';
        button.style.cursor = 'pointer';
    });
}

// Function to update the timeframe for displayed connections
function updateTimeframe() {
    const timeframeSelect = document.getElementById('timeframeSelect');
    const selectedHours = timeframeSelect.value;
    
    console.log(`Updating connections and stats for last ${selectedHours} hours`);
    
    // Reload connections with new timeframe
    loadConnections(selectedHours);
    
    // Update stats with new timeframe
    updateStats();
}

// Function to load connections with specified timeframe
function loadConnections(hours = 48) {
    // Load connections with specified timeframe
    fetch(`/api/connections?hours=${hours}`)
        .then(response => response.json())
        .then(data => {
            // Clear existing connections
            if (typeof vis !== 'undefined' && edges) {
                edges.clear();
            }
            clearMapConnections();
            
            // Update with new connections
            data.forEach(connection => updateConnection(connection));
            
            // Force redraw all map connections
            setTimeout(() => {
                redrawAllMapConnections();
            }, 200);
        })
        .catch(error => {
            console.error('Error loading connections:', error);
        });
}

function updateNetworkConnections(connections) {
    // Clear existing network connections
    if (typeof vis !== 'undefined' && edges) {
        edges.clear();
    }
    
    // Add new connections to network
    connections.forEach(connection => updateConnection(connection));
}

function updateMapConnections(connections) {
    // Clear existing map connections
    clearMapConnections();
    
    // Add new connections to map
    connections.forEach(connection => updateConnection(connection));
    
    // Redraw all map connections
    setTimeout(() => {
        redrawAllMapConnections();
    }, 200);
}

function clearMapConnections() {
    // Clear the connection layer
    if (window.connectionLayer) {
        window.connectionLayer.clearLayers();
    }
    
    // Also clear the connectionLines object
    if (typeof connectionLines !== 'undefined' && connectionLines) {
        connectionLines = {};
    }
}

// Fullscreen functionality
function toggleFullscreen(viewType) {
    const body = document.body;
    const container = viewType === 'map' ? document.querySelector('.map-container') : document.querySelector('.graph-container');
    
    if (container.classList.contains('fullscreen-mode')) {
        // Exit fullscreen
        container.classList.remove('fullscreen-mode');
        body.classList.remove('has-fullscreen');
        
        // Update button text
        const btn = container.querySelector('.fullscreen-btn');
        btn.innerHTML = '⛶';
        btn.title = 'Toggle Fullscreen';
        
        // Trigger resize events to ensure map/network resize properly
        setTimeout(() => {
            if (viewType === 'map' && map) {
                map.invalidateSize();
            } else if (viewType === 'graph' && network) {
                network.fit();
            }
        }, 100);
    } else {
        // Enter fullscreen
        container.classList.add('fullscreen-mode');
        body.classList.add('has-fullscreen');
        
        // Update button text
        const btn = container.querySelector('.fullscreen-btn');
        btn.innerHTML = '⇱';
        btn.title = 'Exit Fullscreen';
        
        // Trigger resize events to ensure map/network resize properly
        setTimeout(() => {
            if (viewType === 'map' && map) {
                map.invalidateSize();
            } else if (viewType === 'graph' && network) {
                network.fit();
            }
        }, 100);
    }
}

// Load mapping data
async function loadMappingData() {
    try {
        const [hardwareRes, modemRes, regionRes, rolesRes] = await Promise.all([
            fetch('/static/json/hardware_models.json'),
            fetch('/static/json/modem_presets.json'),
            fetch('/static/json/region_codes.json'),
            fetch('/static/json/roles.json')
        ]);
        
        hardwareModels = await hardwareRes.json();
        modemPresets = await modemRes.json();
        regionCodes = await regionRes.json();
        roles = await rolesRes.json();
        
        console.log('Mapping data loaded successfully');
    } catch (error) {
        console.error('Error loading mapping data:', error);
    }
}

// Helper functions to get human-readable names
function getHardwareModelName(modelId) {
    if (!modelId && modelId !== 0) return 'Unknown';
    return hardwareModels[modelId.toString()] || `Unknown (${modelId})`;
}

function getHardwareImagePath(modelId) {
    if (!modelId && modelId !== 0) return '/static/images/no_image.png';
    const modelName = hardwareModels[modelId.toString()];
    if (!modelName || modelName === 'UNSET') return '/static/images/no_image.png';
    return `/static/images/devices/${modelName}.png`;
}

function getModemPresetName(presetId) {
    if (!presetId && presetId !== 0) return 'Unknown';
    return modemPresets[presetId.toString()] || `Unknown (${presetId})`;
}

function getRegionName(regionId) {
    if (!regionId && regionId !== 0) return 'Unknown';
    return regionCodes[regionId.toString()] || `Unknown (${regionId})`;
}

function getRoleName(roleId) {
    if (!roleId && roleId !== 0) return 'Unknown';
    return roles[roleId.toString()] || `Unknown (${roleId})`;
}

// Enhanced tooltip generation
function generateEnhancedTooltip(nodeData, nodeId) {
    const hardwareName = getHardwareModelName(nodeData.hardware_model);
    const hardwareImage = getHardwareImagePath(nodeData.hardware_model);
    const modemPreset = getModemPresetName(nodeData.modem_preset);
    const region = getRegionName(nodeData.region);
    const role = getRoleName(nodeData.role);
    
    return `
        <div style="font-family: 'Segoe UI', sans-serif; font-size: 12px; max-width: 350px; background: white; padding: 10px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <img src="${hardwareImage}" alt="${hardwareName}" 
                     style="width: 40px; height: 40px; object-fit: contain; margin-right: 10px; border-radius: 4px; background: #f5f5f5; padding: 2px;"
                     onerror="this.src='/static/images/no_image.png'">
                <div>
                    <div style="font-weight: bold; margin-bottom: 2px; color: #1a202c;">
                        ${nodeData.long_name || nodeData.short_name || 'Unknown Node'}
                    </div>
                    <div style="color: #718096; font-size: 11px;">ID: !${nodeId}</div>
                    ${nodeData.short_name && nodeData.long_name !== nodeData.short_name ? 
                        `<div style="color: #718096; font-size: 11px;">Short: ${nodeData.short_name}</div>` : ''}
                </div>
            </div>
            
            <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 6px;">
                <div style="color: #2d3748; margin-bottom: 3px;"><strong>Hardware:</strong> ${hardwareName}</div>
                ${nodeData.role !== undefined && nodeData.role !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 3px;"><strong>Role:</strong> ${role}</div>` : ''}
                ${nodeData.modem_preset !== undefined && nodeData.modem_preset !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 3px;"><strong>Modem:</strong> ${modemPreset}</div>` : ''}
                ${nodeData.region !== undefined && nodeData.region !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 3px;"><strong>Region:</strong> ${region}</div>` : ''}
                ${nodeData.firmware_version ? 
                    `<div style="color: #2d3748; margin-bottom: 3px;"><strong>Firmware:</strong> ${nodeData.firmware_version}</div>` : ''}
                ${nodeData.has_default_channel !== undefined && nodeData.has_default_channel !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 3px;"><strong>Default Channel:</strong> ${nodeData.has_default_channel ? 'Yes' : 'No'}</div>` : ''}
                ${nodeData.is_licensed !== undefined && nodeData.is_licensed !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 3px;"><strong>Licensed:</strong> ${nodeData.is_licensed ? 'Yes' : 'No'}</div>` : ''}
            </div>
            
            ${(nodeData.latitude || nodeData.longitude || nodeData.altitude || nodeData.position_quality) ? `
            <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 6px;">
                <div style="color: #2d3748; font-weight: bold; margin-bottom: 3px;">📍 Location</div>
                ${nodeData.latitude && nodeData.longitude ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;">
                        <strong>Coordinates:</strong> ${nodeData.latitude.toFixed(6)}, ${nodeData.longitude.toFixed(6)}
                     </div>` : ''}
                ${nodeData.altitude ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Altitude:</strong> ${nodeData.altitude}m</div>` : ''}
                ${nodeData.position_quality ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Position Quality:</strong> ${nodeData.position_quality}</div>` : ''}
            </div>` : ''}
            
            ${(nodeData.battery_level || nodeData.voltage || nodeData.snr || nodeData.rssi || nodeData.channel) ? `
            <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 6px;">
                <div style="color: #2d3748; font-weight: bold; margin-bottom: 3px;">📊 Status</div>
                ${nodeData.battery_level ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Battery:</strong> ${nodeData.battery_level}%</div>` : ''}
                ${nodeData.voltage ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Voltage:</strong> ${nodeData.voltage}V</div>` : ''}
                ${nodeData.snr ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>SNR:</strong> ${nodeData.snr} dB</div>` : ''}
                ${nodeData.rssi ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>RSSI:</strong> ${nodeData.rssi} dBm</div>` : ''}
                ${nodeData.channel !== undefined && nodeData.channel !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Channel:</strong> ${nodeData.channel}</div>` : ''}
            </div>` : ''}
            
            ${nodeData.last_seen ? `
            <div style="color: #718096; font-size: 11px; margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px; text-align: center;">
                <strong>Last seen:</strong> ${new Date(nodeData.last_seen).toLocaleString()}
            </div>` : ''}
        </div>
    `;
}

// Global function to refresh pending connections for updated nodes
function refreshPendingConnections() {
    if (pendingConnectionUpdates.size === 0) {
        return;
    }
    
    console.log('Refreshing connections for nodes:', Array.from(pendingConnectionUpdates));
    
    // Get the current timeframe
    const timeframeSelect = document.getElementById('timeframeSelect');
    const selectedHours = timeframeSelect ? timeframeSelect.value : 48;
    
    // Convert Set to comma-separated string for API call
    const nodeList = Array.from(pendingConnectionUpdates).join(',');
    
    // Fetch connections for the updated nodes
    fetch(`/api/connections?hours=${selectedHours}&nodes=${nodeList}`)
        .then(response => response.json())
        .then(connections => {
            console.log('Refreshed connections for updated nodes:', connections.length);
            // Update connections for these specific nodes
            connections.forEach(connection => updateConnection(connection));
            
            // Force redraw map connections
            setTimeout(() => {
                redrawAllMapConnections();
            }, 100);
        })
        .catch(error => {
            console.error('Error refreshing connections for updated nodes:', error);
        })
        .finally(() => {
            // Clear the pending updates
            pendingConnectionUpdates.clear();
        });
}

// Activity feed collapse functionality
function toggleActivityFeed() {
    const container = document.querySelector('.container');
    const toggleBtn = document.getElementById('activityToggle');
    
    const isCollapsed = container.classList.contains('activity-collapsed');
    
    if (isCollapsed) {
        // Expand
        container.classList.remove('activity-collapsed');
        toggleBtn.innerHTML = '−';
        toggleBtn.title = 'Collapse Activity Feed';
        
        console.log('Activity feed expanded');
    } else {
        // Collapse
        container.classList.add('activity-collapsed');
        toggleBtn.innerHTML = '+';
        toggleBtn.title = 'Expand Activity Feed';
        
        console.log('Activity feed collapsed');
    }
    
    // Trigger map and network resize after layout change
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
        if (network) {
            network.fit();
        }
    }, 300);
}
