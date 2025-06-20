/**
 * Map View Module - Handles all map-related functionality
 */

// Map-specific global variables
let map;
let mapMarkers = {};
let connectionLines = {};

/**
 * Initialize the map view
 */
function initializeMapView() {
    // Initialize OpenStreetMap
    map = L.map('map').setView([39.4, -8.2], 8); // Portugal center
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Add event listeners to clean up ping animations during map interactions
    map.on('movestart zoomstart', function() {
        // Remove any active ping circles when map starts moving
        map.eachLayer(function(layer) {
            if (layer.options && (layer.options.className === 'leaflet-ping-circle' || 
                                layer.options.className === 'leaflet-ping-circle-secondary' ||
                                layer.options.className === 'leaflet-ping-circle-inner')) {
                map.removeLayer(layer);
            }
        });
    });
    
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

/**
 * Show ping animation on map for a specific node
 */
function showMapPing(nodeId) {
    const marker = mapMarkers[nodeId];
    if (!marker) {
        return;
    }
    
    // Get marker's lat/lng position
    const latLng = marker.getLatLng();
    
    // Calculate radius based on zoom level to ensure visibility at all zoom levels
    const currentZoom = map.getZoom();
    const baseRadius = Math.pow(2, (15 - currentZoom)) * 30; // Reduced from 50 to 30
    
    // Create multiple ping circles for more dramatic effect
    const pingRadius1 = L.circle(latLng, {
        radius: baseRadius * 1.5, // Reduced from 2 to 1.5
        color: '#4fd1c7',
        fillColor: '#4fd1c7',
        fillOpacity: 0.4,
        weight: 4,
        className: 'leaflet-ping-circle'
    }).addTo(map);
    
    const pingRadius2 = L.circle(latLng, {
        radius: baseRadius * 1.0, // Reduced from 1.2 to 1.0
        color: '#81e6d9',
        fillColor: '#81e6d9',
        fillOpacity: 0.3,
        weight: 3,
        className: 'leaflet-ping-circle-secondary'
    }).addTo(map);
    
    // Add a third inner circle for more dramatic effect
    const pingRadius3 = L.circle(latLng, {
        radius: baseRadius * 0.5, // Reduced from 0.6 to 0.5
        color: '#ffffff',
        fillColor: '#ffffff',
        fillOpacity: 0.6,
        weight: 2,
        className: 'leaflet-ping-circle-inner'
    }).addTo(map);
    
    // Animate the circles by gradually increasing radius and decreasing opacity
    const animationDuration = 1200; // Match graph ping duration in milliseconds
    const startTime = Date.now();
    
    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1); // 0 to 1 over 1200ms
        
        // Animate first circle (largest, outermost)
        const radius1 = baseRadius * 1.5 + (progress * baseRadius * 5); // Reduced from 8 to 5
        const opacity1 = 0.4 * (1 - progress); // Fade out
        pingRadius1.setRadius(radius1);
        pingRadius1.setStyle({ 
            fillOpacity: opacity1, 
            opacity: opacity1 * 1.5, // Border more visible
            weight: 4 - (progress * 2) // Thinner as it expands
        });
        
        // Animate second circle (delayed start)
        const delay2 = 0.2; // Start at 20% of total animation
        if (progress > delay2) {
            const progress2 = Math.min((progress - delay2) / (1 - delay2), 1);
            const radius2 = baseRadius * 1.0 + (progress2 * baseRadius * 4);
            const opacity2 = 0.3 * (1 - progress2);
            pingRadius2.setRadius(radius2);
            pingRadius2.setStyle({ 
                fillOpacity: opacity2, 
                opacity: opacity2 * 1.8,
                weight: 3 - (progress2 * 1.5)
            });
        }
        
        // Animate third circle (most delayed, stays small longer)
        const delay3 = 0.4; // Start at 40% of total animation
        if (progress > delay3) {
            const progress3 = Math.min((progress - delay3) / (1 - delay3), 1);
            const radius3 = baseRadius * 0.5 + (progress3 * baseRadius * 2);
            const opacity3 = 0.6 * (1 - progress3);
            pingRadius3.setRadius(radius3);
            pingRadius3.setStyle({ 
                fillOpacity: opacity3, 
                opacity: opacity3 * 2,
                weight: Math.max(1, 2 - (progress3 * 1))
            });
        }
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Remove circles when animation is complete
            map.removeLayer(pingRadius1);
            map.removeLayer(pingRadius2);
            map.removeLayer(pingRadius3);
        }
    };
    
    // Start animation
    requestAnimationFrame(animate);
}

/**
 * Update or create a map marker for a node
 */
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
        const popupContent = generateMapPopupContent(nodeData, nodeId);
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
        const popupContent = generateMapPopupContent(nodeData, nodeId);
        
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
            if (window.graphModule) {
                window.graphModule.focusOnNode(nodeId);
            }
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

/**
 * Generate popup content for map markers
 */
function generateMapPopupContent(nodeData, nodeId) {
    const lat = nodeData.latitude;
    const lon = nodeData.longitude;
    const positionQuality = nodeData.position_quality || 'unknown';
    
    return `
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
}

/**
 * Generate enhanced tooltip content for map markers
 */
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

/**
 * Helper functions for getting display names from mapping data
 */
function getHardwareModelName(hwModel) {
    // These functions will need to access the global mapping data from dashboard.js
    if (window.hardwareModels && hwModel !== null && hwModel !== undefined) {
        return window.hardwareModels[hwModel] || `Hardware ${hwModel}`;
    }
    return 'Unknown Hardware';
}

function getHardwareImagePath(hwModel) {
    if (hwModel !== null && hwModel !== undefined) {
        const imageName = Object.keys(window.hardwareModels || {}).find(key => key == hwModel);
        if (imageName) {
            const fileName = window.hardwareModels[imageName].replace(/\s+/g, '_').toUpperCase();
            return `/static/images/devices/${fileName}.png`;
        }
    }
    return '/static/images/no_image.png';
}

function getModemPresetName(preset) {
    if (window.modemPresets && preset !== null && preset !== undefined) {
        return window.modemPresets[preset] || `Preset ${preset}`;
    }
    return 'Unknown Preset';
}

function getRegionName(region) {
    if (window.regionCodes && region !== null && region !== undefined) {
        return window.regionCodes[region] || `Region ${region}`;
    }
    return 'Unknown Region';
}

function getRoleName(role) {
    if (window.roles && role !== null && role !== undefined) {
        return window.roles[role] || `Role ${role}`;
    }
    return 'Unknown Role';
}

/**
 * Redraw map connections for a specific node
 */
function redrawMapConnectionsForNode(nodeId) {
    // Look through all existing edges in the network to find connections involving this node
    if (window.graphModule && window.graphModule.getAllEdges) {
        const allEdges = window.graphModule.getAllEdges();
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

/**
 * Redraw all map connections
 */
function redrawAllMapConnections() {
    // Get all edges from the network graph and redraw map connections
    if (window.graphModule && window.graphModule.getAllEdges) {
        const allEdges = window.graphModule.getAllEdges();
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

/**
 * Focus on a node in the map view
 */
function focusOnNodeInMap(nodeId) {
    // Focus on node in map view without opening popup
    if (mapMarkers[nodeId]) {
        map.setView(mapMarkers[nodeId].getLatLng(), 14);
        // Briefly highlight the marker
        const marker = mapMarkers[nodeId];
        
        // Create a temporary highlighted version
        if (marker._icon) {
            marker._icon.style.filter = 'drop-shadow(0 0 10px #ffff00)';
            setTimeout(() => {
                marker._icon.style.filter = '';
            }, 2000);
        }
    }
}

/**
 * Update map connections
 */
function updateMapConnection(connectionData) {
    const edgeId = `${connectionData.from_node}-${connectionData.to_node}`;
    const fromNodeId = connectionData.from_node.startsWith('!') ? connectionData.from_node.substring(1) : connectionData.from_node;
    const toNodeId = connectionData.to_node.startsWith('!') ? connectionData.to_node.substring(1) : connectionData.to_node;
    
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
            opacity: 0.7,
            pane: 'connectionPane'
        }).addTo(window.connectionLayer);
        
        line.bindPopup(`
            <b>Connection</b><br>
            From: ${connectionData.from_node.slice(-4)}<br>
            To: ${connectionData.to_node.slice(-4)}<br>
            Packets: ${connectionData.packet_count}<br>
            Avg SNR: ${connectionData.avg_snr?.toFixed(1) || 'N/A'}<br>
            Avg RSSI: ${connectionData.avg_rssi || 'N/A'}<br>
            Last seen: ${new Date(connectionData.last_seen).toLocaleString()}
        `);
        
        connectionLines[lineId] = line;
    }
}

/**
 * Clear all map connections
 */
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

/**
 * Auto-fit map to show all markers
 */
function autoFitMap() {
    if (Object.keys(mapMarkers).length > 0) {
        const group = new L.featureGroup(Object.values(mapMarkers));
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

/**
 * Add position quality legend to the map
 */
function addPositionQualityLegend() {
    const legend = L.control({ position: 'bottomright' });
    
    legend.onAdd = function() {
        const div = L.DomUtil.create('div', 'info legend');
        div.style.backgroundColor = 'rgba(26, 32, 44, 0.9)';
        div.style.padding = '10px';
        div.style.borderRadius = '6px';
        div.style.border = '1px solid #4a5568';
        div.style.color = '#e2e8f0';
        div.style.fontSize = '12px';
        div.style.fontFamily = '"Segoe UI", sans-serif';
        
        div.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: bold;">Position Quality</div>
            <div style="margin-bottom: 4px;">
                <span style="display: inline-block; width: 12px; height: 12px; background-color: #48bb78; border-radius: 50%; margin-right: 6px;"></span>
                GPS Confirmed
            </div>
            <div style="margin-bottom: 4px;">
                <span style="display: inline-block; width: 12px; height: 12px; background-color: #ecc94b; border-radius: 50%; margin-right: 6px;"></span>
                Triangulated
            </div>
            <div>
                <span style="display: inline-block; width: 12px; height: 12px; background-color: #e53e3e; border-radius: 50%; margin-right: 6px;"></span>
                Estimated
            </div>
        `;
        
        return div;
    };
    
    legend.addTo(map);
}

// Export functions for use in other modules
window.mapModule = {
    initialize: initializeMapView,
    showPing: showMapPing,
    updateMarker: updateMapMarker,
    focusOnNode: focusOnNodeInMap,
    updateConnection: updateMapConnection,
    redrawConnectionsForNode: redrawMapConnectionsForNode,
    redrawAllConnections: redrawAllMapConnections,
    clearConnections: clearMapConnections,
    autoFit: autoFitMap,
    getMarkers: () => mapMarkers,
    getMap: () => map
};
