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
    map = L.map('map').setView([39.4, -8.2], 4); // Portugal center
    
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
    
    // Add click handler for empty map areas to clear URL focus
    map.on('click', function(e) {
        // Check if the click was on the map background (not on a marker)
        // Markers will handle their own clicks, so this only fires for empty areas
        if (window.updateUrlWithFocusedNode) {
            window.updateUrlWithFocusedNode(null);
        }
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
    
    // Remove existing marker if it exists
    if (mapMarkers[nodeId]) {
        removeMapNode(nodeId);
    }
    
    // Always render the node (centralized lazy loading will control what gets here)
    renderNode(nodeData);
    
    // Check if any existing connections can now draw map lines
    redrawMapConnectionsForNode(nodeId);
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
            
            ${nodeData.environment_metrics ? `
            <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 6px;">
                <div style="color: #2d3748; font-weight: bold; margin-bottom: 3px;">🌡️ Environment</div>
                ${nodeData.environment_metrics.temperature !== undefined && nodeData.environment_metrics.temperature !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Temperature:</strong> ${nodeData.environment_metrics.temperature.toFixed(1)}°C</div>` : ''}
                ${nodeData.environment_metrics.relative_humidity !== undefined && nodeData.environment_metrics.relative_humidity !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Relative Humidity:</strong> ${nodeData.environment_metrics.relative_humidity.toFixed(1)}%</div>` : ''}
                ${nodeData.environment_metrics.barometric_pressure !== undefined && nodeData.environment_metrics.barometric_pressure !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Barometric Pressure:</strong> ${nodeData.environment_metrics.barometric_pressure.toFixed(1)} hPa</div>` : ''}
                ${nodeData.environment_metrics.gas_resistance !== undefined && nodeData.environment_metrics.gas_resistance !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Gas Resistance:</strong> ${nodeData.environment_metrics.gas_resistance} Ω</div>` : ''}
                ${nodeData.environment_metrics.voltage !== undefined && nodeData.environment_metrics.voltage !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Voltage:</strong> ${nodeData.environment_metrics.voltage}V</div>` : ''}
                ${nodeData.environment_metrics.current !== undefined && nodeData.environment_metrics.current !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Current:</strong> ${nodeData.environment_metrics.current}mA</div>` : ''}
                ${nodeData.environment_metrics.iaq !== undefined && nodeData.environment_metrics.iaq !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>IAQ:</strong> ${nodeData.environment_metrics.iaq}</div>` : ''}
                ${nodeData.environment_metrics.wind_direction !== undefined && nodeData.environment_metrics.wind_direction !== null && nodeData.environment_metrics.wind_direction !== 0 ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Wind Direction:</strong> ${nodeData.environment_metrics.wind_direction}°</div>` : ''}
                ${nodeData.environment_metrics.wind_speed !== undefined && nodeData.environment_metrics.wind_speed !== null && nodeData.environment_metrics.wind_speed !== 0 ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Wind Speed:</strong> ${nodeData.environment_metrics.wind_speed} m/s</div>` : ''}
                ${nodeData.environment_metrics.wind_gust !== undefined && nodeData.environment_metrics.wind_gust !== null && nodeData.environment_metrics.wind_gust !== 0 ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Wind Gust:</strong> ${nodeData.environment_metrics.wind_gust} m/s</div>` : ''}
                ${nodeData.environment_metrics.wind_lull !== undefined && nodeData.environment_metrics.wind_lull !== null && nodeData.environment_metrics.wind_lull !== 0 ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>Wind Lull:</strong> ${nodeData.environment_metrics.wind_lull} m/s</div>` : ''}
            </div>` : ''}
            
            ${nodeData.power_metrics ? `
            <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 6px;">
                <div style="color: #2d3748; font-weight: bold; margin-bottom: 3px;">🔋 Power</div>
                ${nodeData.power_metrics.ch1_voltage !== undefined && nodeData.power_metrics.ch1_voltage !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>CH1 Voltage:</strong> ${nodeData.power_metrics.ch1_voltage}V</div>` : ''}
                ${nodeData.power_metrics.ch1_current !== undefined && nodeData.power_metrics.ch1_current !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>CH1 Current:</strong> ${nodeData.power_metrics.ch1_current}mA</div>` : ''}
                ${nodeData.power_metrics.ch2_voltage !== undefined && nodeData.power_metrics.ch2_voltage !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>CH2 Voltage:</strong> ${nodeData.power_metrics.ch2_voltage}V</div>` : ''}
                ${nodeData.power_metrics.ch2_current !== undefined && nodeData.power_metrics.ch2_current !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>CH2 Current:</strong> ${nodeData.power_metrics.ch2_current}mA</div>` : ''}
                ${nodeData.power_metrics.ch3_voltage !== undefined && nodeData.power_metrics.ch3_voltage !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>CH3 Voltage:</strong> ${nodeData.power_metrics.ch3_voltage}V</div>` : ''}
                ${nodeData.power_metrics.ch3_current !== undefined && nodeData.power_metrics.ch3_current !== null ? 
                    `<div style="color: #2d3748; margin-bottom: 2px; font-size: 11px;"><strong>CH3 Current:</strong> ${nodeData.power_metrics.ch3_current}mA</div>` : ''}
            </div>` : ''}
            
            ${nodeData.last_seen ? `
            <div style="color: #718096; font-size: 11px; margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px; text-align: center;">
                <strong>Last seen:</strong> ${new Date(nodeData.last_seen).toLocaleString()}
            </div>` : ''}
        </div>
    `;
}

/**
 * Render a single node (used by centralized lazy loading)
 * @param {Object} nodeData - Node data to render
 */
function renderSingleNode(nodeData) {
    renderNode(nodeData);
}

/**
 * Remove a specific node from the map (used by centralized lazy loading)
 * @param {string} nodeId - The ID of the node to remove
 */
function removeMapNode(nodeId) {
    if (mapMarkers[nodeId]) {
        // Try removing from both markerLayer and map directly
        if (window.markerLayer) {
            window.markerLayer.removeLayer(mapMarkers[nodeId]);
        }
        // Also remove directly from map (for temperature markers)
        if (map.hasLayer(mapMarkers[nodeId])) {
            map.removeLayer(mapMarkers[nodeId]);
        }
        delete mapMarkers[nodeId];
    }
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
        const latLng = mapMarkers[nodeId].getLatLng();
        
        map.setView(latLng, 14);
        
        // Briefly highlight the marker
        const marker = mapMarkers[nodeId];
        
        // Create a temporary highlighted version
        if (marker._icon) {
            marker._icon.style.filter = 'drop-shadow(0 0 10px #ffff00)';
            setTimeout(() => {
                marker._icon.style.filter = '';
            }, 2000);
        }
        
        return true; // Successfully focused
    } else {
        return false; // Failed to focus
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
 * Clear all map markers
 */
function clearMapMarkers() {
    // Remove all markers from the map
    for (const marker of Object.values(mapMarkers)) {
        // Try removing from both markerLayer and map directly
        if (window.markerLayer) {
            window.markerLayer.removeLayer(marker);
        }
        // Also remove directly from map (for temperature markers)
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    }
    
    // Clear the markers object
    mapMarkers = {};
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

// Temperature map functionality
let isTemperatureMapActive = false;

/**
 * Toggle between normal and temperature map modes
 */
function toggleTemperatureMap() {
    isTemperatureMapActive = !isTemperatureMapActive;
    console.log('Temperature map toggled:', isTemperatureMapActive);
    
    const btn = document.querySelector('.temperature-map-btn');
    
    if (isTemperatureMapActive) {
        btn.textContent = '🗺️';
        btn.title = 'Show Normal Map';
        btn.classList.add('active');
    } else {
        btn.textContent = '🌡️';
        btn.title = 'Show Temperature Map';
        btn.classList.remove('active');
    }
    
    // Clear all existing markers first so they get re-rendered in the new mode
    clearMapMarkers();
    
    // Force a complete refresh through the centralized system
    if (window.LazyLoadingManager) {
        console.log('Calling LazyLoadingManager.forceRefresh()');
        window.LazyLoadingManager.forceRefresh();
    } else {
        console.log('LazyLoadingManager not available, using fallback');
        // Fallback if centralized system is not available
        renderAllNodes();
    }
}

/**
 * Render all nodes based on current mode (normal or temperature)
 * Only used when lazy loading is disabled
 */
function renderAllNodes() {
    // Clear existing markers completely
    clearMapMarkers();
    
    // Clear connections in temperature mode
    if (isTemperatureMapActive) {
        clearMapConnections();
    }
    
    // Render all nodes (legacy mode - now primarily used for fallback)
    const nodesData = window.getCachedNodesData ? window.getCachedNodesData() : {};
    let renderCount = 0;
    
    for (const nodeId in nodesData) {
        const node = nodesData[nodeId];
        if (renderNode(node)) {
            renderCount++;
        }
    }
    
    console.log(`Rendered ${renderCount} nodes in non-lazy mode`);
    
    // Restore connections if in normal mode
    if (!isTemperatureMapActive) {
        restoreConnections();
    }
}

/**
 * Render a single node based on current mode
 * Returns true if node was rendered, false if skipped
 */
function renderNode(nodeData) {
    if (!nodeData || !nodeData.node_id) return false;
    
    const nodeId = nodeData.node_id;
    const lat = nodeData.latitude;
    const lon = nodeData.longitude;
    
    // Skip nodes without valid coordinates
    if (!lat || !lon || lat == null || lon == null || 
        lat === '' || lon === '' || isNaN(lat) || isNaN(lon)) {
        return false;
    }

    console.log(`Rendering node ${nodeId}, temperature mode: ${isTemperatureMapActive}`);
    
    let marker;
    
    if (isTemperatureMapActive) {
        console.log(`Temperature mode - checking node ${nodeId} for temperature data`);
        // Temperature mode: only show nodes with temperature data
        if (!nodeData.environment_metrics || typeof nodeData.environment_metrics.temperature !== 'number') {
            console.log(`Node ${nodeId} skipped - no temperature data`);
            return false; // Skip nodes without temperature data
        }
        
        const temp = nodeData.environment_metrics.temperature;
        const color = getTemperatureColor(temp);
        
        console.log(`Rendering temperature node ${nodeId}: ${temp}°C with color ${color}`);
        
        const tempLabel = L.divIcon({
            className: 'temperature-label',
            html: `<div style="background-color: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; border: 1px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${temp.toFixed(1)}°C</div>`,
            iconSize: [50, 20],
            iconAnchor: [25, 10]
        });
        
        marker = L.marker([lat, lon], { icon: tempLabel }).addTo(map);
    } else {
        console.log(`Rendering normal node ${nodeId}`);
        // Normal mode: show all nodes with position quality colors
        const positionQuality = nodeData.position_quality || 'unknown';
        let markerColor = '#4fd1c7'; // Default teal
        
        switch (positionQuality) {
            case 'confirmed':
                markerColor = '#48bb78'; // Green for confirmed GPS positions
                break;
            case 'triangulated':
                markerColor = '#ecc94b'; // Yellow for triangulated positions
                break;
            case 'estimated':
                markerColor = '#e53e3e'; // Red for estimated positions
                break;
        }
        
        marker = L.circleMarker([lat, lon], {
            radius: 8,
            fillColor: markerColor,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
            pane: 'markerPane'
        }).addTo(window.markerLayer);
        
        // Add click event for normal mode
        marker.on('click', function() {
            if (window.updateUrlWithFocusedNode) {
                window.updateUrlWithFocusedNode(nodeId);
            }
            if (window.graphModule) {
                window.graphModule.focusOnNode(nodeId);
            }
        });
        
        // Add hover effects for normal mode
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
    }
    
    // Add enhanced tooltip for both modes
    const tooltipContent = generateEnhancedTooltip(nodeData, nodeId);
    marker.bindTooltip(tooltipContent, {
        direction: 'top',
        offset: [0, -10],
        opacity: 0.9,
        className: 'custom-tooltip'
    });
    
    // Store marker
    mapMarkers[nodeId] = marker;
    return true;
}

/**
 * Restore connections for normal mode
 */
function restoreConnections() {
    const timeframeSelect = document.getElementById('timeframeSelect');
    const distanceLimitSelect = document.getElementById('distanceLimitSelect');
    const selectedHours = timeframeSelect ? timeframeSelect.value : '48';
    const selectedDistance = distanceLimitSelect ? parseInt(distanceLimitSelect.value) : 250;
    
    fetch(`/api/connections?hours=${selectedHours}`)
        .then(response => response.json())
        .then(data => {
            const nodesData = window.getCachedNodesData ? window.getCachedNodesData() : {};
            const filteredConnections = window.filterConnectionsByDistance ? 
                window.filterConnectionsByDistance(data, nodesData, selectedDistance) : data;
            
            filteredConnections.forEach(connection => {
                if (window.updateConnection) {
                    window.updateConnection(connection);
                }
            });
            
            setTimeout(() => {
                redrawAllMapConnections();
            }, 200);
        })
        .catch(error => console.error('Error restoring connections:', error));
}

function getTemperatureColor(temp) {
  // Enhanced color scale: blue (cold) to red (hot)
  // Range: -5°C to 40°C for better real-world coverage
  const minTemp = -5, maxTemp = 40;
  const t = Math.max(0, Math.min(1, (temp - minTemp) / (maxTemp - minTemp)));
  
  if (t < 0.5) {
    // Blue to cyan to green
    const t2 = t * 2;
    const r = Math.round(0 * (1 - t2) + 0 * t2);
    const g = Math.round(150 * (1 - t2) + 255 * t2);
    const b = Math.round(255 * (1 - t2) + 150 * t2);
    return `rgb(${r},${g},${b})`;
  } else {
    // Green to yellow to red
    const t2 = (t - 0.5) * 2;
    const r = Math.round(0 * (1 - t2) + 255 * t2);
    const g = Math.round(255 * (1 - t2) + 150 * t2);
    const b = Math.round(150 * (1 - t2) + 0 * t2);
    return `rgb(${r},${g},${b})`;
  }
}

// Export functions for use in other modules
window.mapModule = {
    initialize: initializeMapView,
    showPing: showMapPing,
    updateMarker: updateMapMarker,
    renderNode: renderSingleNode,
    removeNode: removeMapNode,
    renderAllNodes: renderAllNodes,
    focusOnNode: focusOnNodeInMap,
    updateConnection: updateMapConnection,
    redrawConnectionsForNode: redrawMapConnectionsForNode,
    redrawAllConnections: redrawAllMapConnections,
    clearConnections: clearMapConnections,
    clearMarkers: clearMapMarkers,
    autoFit: autoFitMap,
    getMarkers: () => mapMarkers,
    getMap: () => map,
    generateTooltip: generateEnhancedTooltip,
    toggleTemperatureMap: toggleTemperatureMap,
    isTemperatureMapActive: () => isTemperatureMapActive
};
