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
    
    // Initialize vis DataSets
    nodes = new vis.DataSet();
    edges = new vis.DataSet();
    
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
            if (window.showNodePopup) {
                window.showNodePopup(nodeId);
            }
            // Also focus the node on the map if it has a position
            if (window.mapModule) {
                window.mapModule.focusOnNode(nodeId);
            }
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
    
    const networkNode = {
        id: nodeId,
        label: decodedShortName || nodeId.slice(-4),
        title: `${decodedLongName || 'Unknown'}\nID: ${nodeId}\nPosition Quality: ${nodeData.position_quality || 'unknown'}\nLast seen: ${nodeData.last_seen || 'Never'}`,
        color: nodeColor
    };
    
    if (nodes.get(nodeId)) {
        nodes.update(networkNode);
    } else {
        nodes.add(networkNode);
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
        }
    }
}

/**
 * Ensure a node exists in the graph (create placeholder if needed)
 */
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

/**
 * Update or create a network edge/connection
 */
function updateNetworkConnection(connectionData) {
    if (typeof vis === 'undefined' || !edges) {
        return;
    }
    
    const edgeId = `${connectionData.from_node}-${connectionData.to_node}`;
    
    // Remove leading "!" if present
    const fromNodeId = connectionData.from_node.startsWith('!') ? connectionData.from_node.substring(1) : connectionData.from_node;
    const toNodeId = connectionData.to_node.startsWith('!') ? connectionData.to_node.substring(1) : connectionData.to_node;
    
    ensureNodeExists(fromNodeId);
    ensureNodeExists(toNodeId);
    
    // Update network graph edge
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
    getAllEdges: getAllEdges,
    getAllNodes: getAllNodes,
    getNetwork: getNetwork,
    getNodesDataset: getNodesDataset,
    getEdgesDataset: getEdgesDataset,
    isAvailable: isVisAvailable
};
