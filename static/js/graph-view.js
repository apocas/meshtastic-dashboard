/**
 * Graph View Module - Handles all network graph functionality using vis.js
 */

// Graph-specific global variables
let network;
let nodes, edges;

/**
 * Initialize the network graph view
 */
function initializeGraphView() {
    // Check if vis is available
    if (typeof vis === 'undefined') {
        console.error('vis.js is not available for network initialization');
        document.getElementById('network').innerHTML = '<div style="color: white; text-align: center; padding: 50px;">Network graph unavailable - vis.js not loaded</div>';
        return;
    }
    
    try {
        // Initialize vis DataSets with error handling
        nodes = new vis.DataSet();
        edges = new vis.DataSet();
    } catch (error) {
        console.error('Error initializing vis DataSets:', error);
        document.getElementById('network').innerHTML = '<div style="color: white; text-align: center; padding: 50px;">Network graph initialization failed</div>';
        return;
    }
    
    // Initialize network graph
    const container = document.getElementById('network');
    if (!container) {
        console.error('Network container element not found');
        return;
    }
    
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
            },
            chosen: {
                node: function(values, id, selected, hovering) {
                    // Disable default hover highlighting to let our custom tooltip work
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
            tooltipDelay: 0,
            hideEdgesOnDrag: false,
            hideNodesOnDrag: false,
            selectConnectedEdges: false
        },
        configure: {
            enabled: false
        },
        manipulation: {
            enabled: false
        }
    };
    
    try {
        network = new vis.Network(container, data, options);
    } catch (error) {
        console.error('Error creating vis Network:', error);
        container.innerHTML = '<div style="color: white; text-align: center; padding: 50px;">Network graph creation failed</div>';
        return;
    }
    
    // Add event listeners to clean up ping animations during network interactions
    network.on('dragStart', function() {
        // Remove any active network ping animations when dragging starts
        const pings = document.querySelectorAll('.ping-node');
        pings.forEach(ping => {
            if (ping.parentNode) {
                ping.parentNode.removeChild(ping);
            }
        });
    });
    
    network.on('zoom', function() {
        // Remove any active network ping animations when zooming
        const pings = document.querySelectorAll('.ping-node');
        pings.forEach(ping => {
            if (ping.parentNode) {
                ping.parentNode.removeChild(ping);
            }
        });
    });
    
    // Network event handlers
    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            
            // Update URL with focused node for sharing
            if (window.updateUrlWithFocusedNode) {
                window.updateUrlWithFocusedNode(nodeId);
            }
            
            // Get node data to check position quality
            const visNode = nodes.get(nodeId);
            const nodeData = visNode ? visNode.nodeData : null;
            
            // Only show popup if node doesn't have confirmed position
            if (window.showNodePopup && nodeData) {
                const positionQuality = nodeData.position_quality || 'unknown';
                const hasPosition = nodeData.latitude != null && nodeData.longitude != null && 
                                   nodeData.latitude !== '' && nodeData.longitude !== '' &&
                                   !isNaN(nodeData.latitude) && !isNaN(nodeData.longitude);
                
                // Show popup only if position is not confirmed or doesn't exist
                if (!hasPosition || positionQuality !== 'confirmed') {
                    window.showNodePopup(nodeId);
                }
            }
            
            // Also focus the node on the map if it has a position
            if (window.mapModule) {
                window.mapModule.focusOnNode(nodeId);
            }
        } else {
            // Clicked on empty space - clear URL focus parameter
            if (window.updateUrlWithFocusedNode) {
                window.updateUrlWithFocusedNode(null);
            }
        }
    });
    
    // Add hover event handlers for enhanced tooltips
    network.on('hoverNode', function(params) {
        const nodeId = params.node;
        
        // Get node data from the vis.js nodes dataset
        const visNode = nodes.get(nodeId);
        const nodeData = visNode ? visNode.nodeData : null;
        
        if (nodeData) {
            // Generate enhanced tooltip content
            const tooltipContent = generateEnhancedTooltip(nodeData, nodeId);
            
            // Remove any existing tooltip
            let existingTooltip = document.getElementById('graph-tooltip');
            if (existingTooltip) {
                existingTooltip.remove();
            }
            
            // Create tooltip element
            const tooltip = document.createElement('div');
            tooltip.id = 'graph-tooltip';
            tooltip.style.cssText = `
                position: fixed;
                z-index: 10000;
                pointer-events: none;
                max-width: 350px;
                opacity: 0;
                transition: opacity 0.2s ease-in-out;
                background: white;
                border-radius: 6px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                font-family: 'Segoe UI', sans-serif;
                font-size: 12px;
            `;
            document.body.appendChild(tooltip);
            
            tooltip.innerHTML = tooltipContent;
            
            // Get the network canvas position
            const networkContainer = document.getElementById('network');
            const canvasRect = networkContainer.getBoundingClientRect();
            
            // Position tooltip relative to the node position or mouse
            const updateTooltipPosition = (e) => {
                const offset = 15;
                let x = e.clientX + offset;
                let y = e.clientY + offset;
                
                // Adjust position if tooltip would go off screen
                const rect = tooltip.getBoundingClientRect();
                if (x + rect.width > window.innerWidth) {
                    x = e.clientX - rect.width - offset;
                }
                if (y + rect.height > window.innerHeight) {
                    y = e.clientY - rect.height - offset;
                }
                
                tooltip.style.left = x + 'px';
                tooltip.style.top = y + 'px';
            };
            
            // Position tooltip initially
            const currentEvent = params.event || window.event;
            if (currentEvent) {
                updateTooltipPosition(currentEvent);
            } else {
                // Fallback: position near the network container
                tooltip.style.left = (canvasRect.left + 20) + 'px';
                tooltip.style.top = (canvasRect.top + 20) + 'px';
            }
            
            // Add mouse move listener for tooltip positioning
            const onMouseMove = (e) => updateTooltipPosition(e);
            document.addEventListener('mousemove', onMouseMove);
            
            // Store reference to remove listener later
            tooltip._mouseMoveHandler = onMouseMove;
            
            // Show tooltip
            requestAnimationFrame(() => {
                tooltip.style.opacity = '1';
            });
        }
    });
    
    network.on('blurNode', function(params) {
        // Hide tooltip when mouse leaves node
        const tooltip = document.getElementById('graph-tooltip');
        if (tooltip) {
            tooltip.style.opacity = '0';
            
            // Remove mouse move listener
            if (tooltip._mouseMoveHandler) {
                document.removeEventListener('mousemove', tooltip._mouseMoveHandler);
                tooltip._mouseMoveHandler = null;
            }
            
            // Remove tooltip after fade out
            setTimeout(() => {
                if (tooltip && tooltip.style.opacity === '0') {
                    tooltip.remove();
                }
            }, 200);
        }
    });
}

/**
 * Update or create a network node
 */
function updateNetworkNode(nodeData) {
    if (typeof vis === 'undefined' || !nodes) {
        return;
    }
    
    // Validate nodeData thoroughly
    if (!nodeData || typeof nodeData !== 'object' || nodeData === null) {
        console.warn('Invalid nodeData passed to updateNetworkNode:', nodeData);
        return;
    }
    
    const nodeId = nodeData.node_id;
    if (!nodeId || typeof nodeId !== 'string' || nodeId.trim() === '') {
        console.warn('Node data missing valid node_id:', nodeData);
        return;
    }
    
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
    
    // Helper function to decode Unicode escape sequences
    function decodeUnicodeEscapes(str) {
        if (!str || typeof str !== 'string') return str;
        try {
            return str.replace(/\\u[\dA-F]{4}/gi, function (match) {
                return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
            });
        } catch (e) {
            return str;
        }
    }
    
    // Decode Unicode in names
    const decodedShortName = decodeUnicodeEscapes(nodeData.short_name);
    const decodedLongName = decodeUnicodeEscapes(nodeData.long_name);
    // Create the network node object with safe values
    const networkNode = {
        id: String(nodeId), // Ensure it's a string
        label: String(nodeId), // Use nodeId instead of shortName, ensure string
        nodeData: nodeData  // Store the full node data for tooltip access
    };
    
    // Only set color if it's defined and valid
    if (nodeColor && typeof nodeColor === 'object') {
        networkNode.color = nodeColor;
    }
    
    try {
        // Check if node already exists before updating
        const existingNode = nodes.get(nodeId);
        if (existingNode) {
            nodes.update(networkNode);
        } else {
            nodes.add(networkNode);
        }
    } catch (error) {
        console.error('Error updating network node:', nodeId, error, 'NetworkNode:', networkNode);
        // Try to recover by creating a minimal node
        try {
            const minimalNode = {
                id: String(nodeId),
                label: String(nodeId)
            };
            if (!nodes.get(nodeId)) {
                nodes.add(minimalNode);
            }
        } catch (recoveryError) {
            console.error('Failed to recover from node update error:', recoveryError);
        }
    }
}

/**
 * Show ping animation on graph for a specific node
 */
function showGraphPing(nodeId) {
    if (!network || typeof vis === 'undefined') {
        return;
    }
    
    try {
        // Get node position in the network view
        const nodePosition = network.getPositions([nodeId]);
        if (!nodePosition[nodeId]) {
            return;
        }
        
        const canvasPosition = network.canvasToDOM(nodePosition[nodeId]);
        
        // Create ping element
        const ping = document.createElement('div');
        ping.className = 'ping-node';
        ping.style.left = (canvasPosition.x - 15) + 'px';
        ping.style.top = (canvasPosition.y - 15) + 'px';
        ping.style.width = '30px';
        ping.style.height = '30px';
        ping.style.position = 'absolute';
        ping.style.zIndex = '1000';
        
        // Add to network container
        const networkContainer = document.getElementById('network');
        networkContainer.style.position = 'relative';
        networkContainer.appendChild(ping);
        
        // Remove after animation completes
        setTimeout(() => {
            if (ping.parentNode) ping.parentNode.removeChild(ping);
        }, 1200);
    } catch (error) {
        // Silently handle errors
    }
}

/**
 * Focus on a node in the graph view
 */
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
            return true; // Successfully focused
        } else {
            return false; // Node not found
        }
    } else {
        return false; // Graph not ready
    }
}

/**
 * Ensure a node exists in the graph (create placeholder if needed)
 */
function ensureNodeExists(nodeId) {
    if (!nodeId || typeof nodeId !== 'string' || nodeId.trim() === '' || nodeId === 'ffffffff') {
        return; // Skip invalid or broadcast IDs
    }
    
    if (typeof vis !== 'undefined' && nodes && !nodes.get(nodeId)) {
        try {
            // Create placeholder node with safe values
            const placeholderNode = {
                id: String(nodeId),
                label: String(nodeId), // Show full node ID
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
        } catch (error) {
            console.error('Error creating placeholder node:', nodeId, error);
        }
    }
}

/**
 * Update or create a network edge/connection
 */
function updateNetworkConnection(connectionData) {
    if (typeof vis === 'undefined' || !edges) {
        return;
    }
    
    // Validate connectionData
    if (!connectionData || typeof connectionData !== 'object' || connectionData === null) {
        console.warn('Invalid connectionData passed to updateNetworkConnection:', connectionData);
        return;
    }
    
    // Validate required fields
    if (!connectionData.from_node || !connectionData.to_node) {
        console.warn('Connection data missing required fields:', connectionData);
        return;
    }
    
    const edgeId = `${connectionData.from_node}-${connectionData.to_node}`;
    
    // Remove leading "!" if present
    const fromNodeId = connectionData.from_node.startsWith('!') ? connectionData.from_node.substring(1) : connectionData.from_node;
    const toNodeId = connectionData.to_node.startsWith('!') ? connectionData.to_node.substring(1) : connectionData.to_node;
    
    // Validate cleaned node IDs
    if (!fromNodeId || !toNodeId || fromNodeId.trim() === '' || toNodeId.trim() === '') {
        console.warn('Invalid cleaned node IDs:', { fromNodeId, toNodeId, original: connectionData });
        return;
    }
    
    ensureNodeExists(fromNodeId);
    ensureNodeExists(toNodeId);
    
    // Create edge object with safe values
    const edge = {
        id: String(edgeId),
        from: String(fromNodeId),
        to: String(toNodeId),
        label: String(connectionData.packet_count || '0'),
        title: `Packets: ${connectionData.packet_count || 0}\nAvg SNR: ${connectionData.avg_snr?.toFixed(1) || 'N/A'}\nAvg RSSI: ${connectionData.avg_rssi || 'N/A'}\nLast seen: ${new Date(connectionData.last_seen).toLocaleString()}`
    };
    
    try {
        const existingEdge = edges.get(edgeId);
        if (existingEdge) {
            edges.update(edge);
        } else {
            edges.add(edge);
        }
    } catch (error) {
        console.error('Error updating network edge:', edgeId, error, 'Edge:', edge);
        // Try to recover with minimal edge
        try {
            const minimalEdge = {
                id: String(edgeId),
                from: String(fromNodeId),
                to: String(toNodeId)
            };
            if (!edges.get(edgeId)) {
                edges.add(minimalEdge);
            }
        } catch (recoveryError) {
            console.error('Failed to recover from edge update error:', recoveryError);
        }
    }
}

/**
 * Clear all network nodes
 */
function clearNetworkNodes() {
    // Clear existing network nodes
    if (typeof vis !== 'undefined' && nodes) {
        nodes.clear();
    }
}

/**
 * Clear all network connections
 */
function clearNetworkConnections() {
    // Clear existing network connections
    if (typeof vis !== 'undefined' && edges) {
        edges.clear();
    }
}

/**
 * Update network connections with new data
 */
function updateNetworkConnections(connections) {
    // Clear existing network connections
    clearNetworkConnections();
    
    // Add new connections to network
    connections.forEach(connection => updateNetworkConnection(connection));
}

/**
 * Get all edges from the network
 */
function getAllEdges() {
    if (typeof vis !== 'undefined' && edges) {
        return edges.get();
    }
    return [];
}

/**
 * Get all nodes from the network
 */
function getAllNodes() {
    if (typeof vis !== 'undefined' && nodes) {
        return nodes.get();
    }
    return [];
}

/**
 * Get network instance
 */
function getNetwork() {
    return network;
}

/**
 * Get nodes dataset
 */
function getNodesDataset() {
    return nodes;
}

/**
 * Get edges dataset
 */
function getEdgesDataset() {
    return edges;
}

/**
 * Check if vis.js is available
 */
function isVisAvailable() {
    return typeof vis !== 'undefined';
}

/**
 * Generate enhanced tooltip content for graph nodes
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
 * Auto-fit the graph to show all nodes in the viewport
 */
function autoFitGraph() {
    if (network && nodes.length > 0) {
        network.fit({
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad'
            }
        });
    }
}

/**
 * Helper functions for getting display names from mapping data
 */
function getHardwareModelName(hwModel) {
    // Access the global mapping data from dashboard.js
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

// Export functions for use in other modules
window.graphModule = {
    initialize: initializeGraphView,
    updateNode: updateNetworkNode,
    showPing: showGraphPing,
    focusOnNode: focusOnNodeInGraph,
    ensureNodeExists: ensureNodeExists,
    updateConnection: updateNetworkConnection,
    updateConnections: updateNetworkConnections,
    clearConnections: clearNetworkConnections,
    clearNodes: clearNetworkNodes,
    getAllEdges: getAllEdges,
    getAllNodes: getAllNodes,
    autoFit: autoFitGraph,
    getNetwork: getNetwork,
    getNodesDataset: getNodesDataset,
    getEdgesDataset: getEdgesDataset,
    isAvailable: isVisAvailable
};
