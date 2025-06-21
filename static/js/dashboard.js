// Global variables
let socket;
let pendingConnectionUpdates = new Set(); // Track nodes that need connection updates
let nodeUpdateTimeouts = new Map(); // Debounce node updates

// Global variables for mapping data
let hardwareModels = {};
let modemPresets = {};
let regionCodes = {};
let roles = {};

// Global cache for nodes data - populated once and maintained via WebSocket updates
let cachedNodesData = {};
let isNodesDataLoaded = false;

/**
 * Get nodes data from cache (should always be available after initial load)
 * @returns {Object} Nodes data object
 */
function getCachedNodesData() {
  if (!isNodesDataLoaded || Object.keys(cachedNodesData).length === 0) {
    console.warn('Nodes data not loaded yet, returning empty object');
    return {};
  }
  return cachedNodesData;
}

/**
 * Fetch nodes data initially (should only be called once during page load)
 * @returns {Promise<Object>} Promise that resolves to nodes data object
 */
async function fetchInitialNodesData() {
  if (isNodesDataLoaded) {
    console.warn('Nodes data already loaded, returning cached data');
    return cachedNodesData;
  }
  
  try {
    console.log('Fetching initial nodes data from API...');
    const response = await fetch('/api/nodes');
    const nodesArray = await response.json();
    
    // Convert to object format and cache
    cachedNodesData = nodesArray.reduce((acc, node) => {
      acc[node.node_id] = node;
      return acc;
    }, {});
    
    isNodesDataLoaded = true;
    console.log(`Loaded ${nodesArray.length} nodes into cache`);
    return cachedNodesData;
  } catch (error) {
    console.error('Error fetching initial nodes data:', error);
    throw error;
  }
}

/**
 * Update a specific node in the cache (called when WebSocket updates arrive)
 * @param {string} nodeId - The node ID to update
 * @param {Object} nodeData - The updated node data
 */
function updateNodeInCache(nodeId, nodeData) {
  if (isNodesDataLoaded && cachedNodesData) {
    cachedNodesData[nodeId] = nodeData;
    console.log(`Updated node ${nodeId} in cache`);
  } else {
    console.warn(`Cannot update node ${nodeId} in cache - nodes data not loaded`);
  }
}

/**
 * Add a new node to the cache (called when new nodes are discovered)
 * @param {string} nodeId - The node ID to add
 * @param {Object} nodeData - The node data
 */
function addNodeToCache(nodeId, nodeData) {
  if (isNodesDataLoaded && cachedNodesData) {
    cachedNodesData[nodeId] = nodeData;
    console.log(`Added new node ${nodeId} to cache`);
  } else {
    console.warn(`Cannot add node ${nodeId} to cache - nodes data not loaded`);
  }
}

// URL parameter utilities for sharing focused nodes
function updateUrlWithFocusedNode(nodeId) {
  const url = new URL(window.location);
  if (nodeId) {
    url.searchParams.set('node', nodeId);
  } else {
    url.searchParams.delete('node');
  }
  window.history.replaceState({}, '', url);
}

function getFocusedNodeFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('node');
}

function focusNodeFromUrl() {
  const focusedNodeId = getFocusedNodeFromUrl();
  if (focusedNodeId) {
    // Show loading overlay
    showLoadingOverlay(`Focusing on node ${focusedNodeId}`, 'Please wait while the dashboard loads...');
    
    setTimeout(() => {
      window.mapModule.focusOnNode(focusedNodeId);
      window.graphModule.focusOnNode(focusedNodeId);
      
      // Hide loading overlay
      hideLoadingOverlay();
    }, 6000);
  }
}

// Loading overlay functions
function showLoadingOverlay(message, subMessage) {
  // Remove existing overlay if present
  hideLoadingOverlay();
  
  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.className = 'loading-overlay';
  
  overlay.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div class="loading-text">${message}</div>
      <div class="loading-subtext">${subMessage}</div>
    </div>
  `;
  
  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.remove();
  }
}

// Make URL functions available globally
window.updateUrlWithFocusedNode = updateUrlWithFocusedNode;
window.getFocusedNodeFromUrl = getFocusedNodeFromUrl;
window.focusNodeFromUrl = focusNodeFromUrl;
window.showLoadingOverlay = showLoadingOverlay;
window.hideLoadingOverlay = hideLoadingOverlay;

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
  // Initialize interactive search functionality
  initializeSearch();

  // Make main title clickable to refresh/go to root
  const titleElement = document.querySelector('.title');
  if (titleElement) {
    titleElement.style.cursor = 'pointer';
    titleElement.addEventListener('click', function() {
      // Navigate to root URL, which effectively refreshes the page
      window.location.href = '/';
    });
  }

  // Setup modal close and fullscreen exit on Escape key
  document.addEventListener('keydown', function (e) {
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
  setTimeout(function () {
    // Initialize modules
    if (window.mapModule) {
      window.mapModule.initialize();
    }

    if (window.graphModule && window.graphModule.isAvailable()) {
      window.graphModule.initialize();
    } else if (!window.graphModule || !window.graphModule.isAvailable()) {
      document.getElementById('network').innerHTML =
        '<div style="color: white; text-align: center; padding: 50px; font-size: 16px;">' +
        '⚠️ Network graph unavailable<br>' +
        '<small>vis.js library failed to load</small></div>';
    }

    initializeWebSocket();
    loadMappingData();
    loadInitialData();
  }, 500);
});

// Load MQTT info when window is fully loaded
window.addEventListener('load', function () {
  loadMqttInfo();

  // Backup attempt to focus node from URL after everything is fully loaded
  // This acts as a fallback in case the first attempt during data loading didn't work
  setTimeout(() => {
    focusNodeFromUrl();
  }, 1000);

  // Set up automatic refresh every 30 minutes
  setupAutoRefresh();
});

/**
 * Setup automatic page refresh every 30 minutes
 */
function setupAutoRefresh() {
  const refreshInterval = 30 * 60 * 1000; // 30 minutes in milliseconds
  
  setTimeout(() => {
    console.log('Auto-refreshing dashboard after 30 minutes...');
    window.location.reload();
  }, refreshInterval);
}





function initializeWebSocket() {
  socket = io();

  socket.on('connect', function () {
    updateConnectionStatus(true);
    addLogEntry('system', 'Connected to dashboard server');
  });

  socket.on('disconnect', function () {
    updateConnectionStatus(false);
    addLogEntry('system', 'Disconnected from dashboard server');
  });

  socket.on('node_update', function (data) {
    // New approach: data only contains node_id, fetch fresh data from API
    const nodeId = data.node_id;
    if (!nodeId) {
      console.error('Received node_update without node_id:', data);
      return;
    }

    // Debounce node updates to prevent rapid-fire API calls for the same node
    clearTimeout(nodeUpdateTimeouts.get(nodeId));
    nodeUpdateTimeouts.set(nodeId, setTimeout(() => {
      // Fetch fresh node data from the API
      fetchNodeData(nodeId)
        .then(nodeData => {
          updateNode(nodeData);
          // Update the specific node in cache instead of invalidating entire cache
          updateNodeInCache(nodeId, nodeData);
          // Add node to pending updates for connection refresh
          pendingConnectionUpdates.add(nodeId);
          // Debounce connection updates to avoid too many API calls
          clearTimeout(window.connectionUpdateTimeout);
          window.connectionUpdateTimeout = setTimeout(refreshPendingConnections, 500);
        })
        .catch(error => {
          // Error is already logged in fetchNodeData function
        });
        
      // Clean up the timeout reference
      nodeUpdateTimeouts.delete(nodeId);
    }, 100)); // 100ms debounce delay
  });

  socket.on('packet_update', function (data) {
    handlePacketUpdate(data);
  });
}

function loadInitialData() {
  // Fetch initial nodes data (this should be the ONLY /api/nodes call ever)
  fetchInitialNodesData()
    .then(nodesData => {
      // Convert back to array format for processing
      const nodesArray = Object.values(nodesData);
      nodesArray.forEach(node => updateNode(node));
      
      // Auto-fit map to show all markers after loading
      setTimeout(() => {
        if (window.mapModule) {
          window.mapModule.autoFit();
        }
      }, 100);

      // Load connections after nodes are loaded and markers are created
      const timeframeSelect = document.getElementById('timeframeSelect');
      const selectedHours = timeframeSelect ? timeframeSelect.value : '48';
      return fetch(`/api/connections?hours=${selectedHours}`);
    })
    .then(response => response.json())
    .then(data => {
      // Filter connections by distance using cached nodes data
      // (No additional /api/nodes requests needed)
      const distanceLimitSelect = document.getElementById('distanceLimitSelect');
      const selectedDistance = distanceLimitSelect ? parseInt(distanceLimitSelect.value) : 250;
      return filterConnectionsByDistance(data, cachedNodesData, selectedDistance);
    })
    .then(filteredConnections => {
      filteredConnections.forEach(connection => updateConnection(connection));
      // Force redraw all map connections after both nodes and connections are loaded
      setTimeout(() => {
        if (window.mapModule) {
          window.mapModule.redrawAllConnections();
        }

        // Focus on node from URL parameter after all data is loaded
        // The function now includes retry logic to wait for views to be ready
        focusNodeFromUrl();
      }, 500); // Increased delay to give views more time to initialize
    })
    .catch(error => console.error('Error loading initial data:', error));

  // Initialize stats
  if (window.statsModule) {
    window.statsModule.initialize();
  }
}

function loadMqttInfo() {
  // First, check if the element exists
  const mqttInfoElement = document.getElementById('mqtt-info');
  if (!mqttInfoElement) {
    // Try again after a longer delay
    setTimeout(() => {
      loadMqttInfo();
    }, 1000);
    return;
  }

  fetch('/api/mqtt/info')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        mqttInfoElement.textContent = 'MQTT: Connection error';
        console.error('MQTT API error:', data.error);
      } else {
        // Format: "MQTT: broker:port (topic)"
        const mqttText = `${data.broker}:${data.port} (${data.topic})`;
        mqttInfoElement.textContent = mqttText;
      }
    })
    .catch(error => {
      console.error('Error loading MQTT info:', error);
      mqttInfoElement.textContent = 'MQTT: Connection unavailable';
    });
}

// Make loadMqttInfo available globally for testing
window.loadMqttInfo = loadMqttInfo;

function showNodeUpdatePing(nodeId) {
  // Show ping on map if node has a marker
  if (window.mapModule) {
    window.mapModule.showPing(nodeId);
  }

  // Show ping on graph
  if (window.graphModule) {
    window.graphModule.showPing(nodeId);
  }
}

function updateNode(nodeData) {
  const nodeId = nodeData.node_id;

  const hasPosition = nodeData.latitude != null && nodeData.longitude != null &&
    nodeData.latitude !== '' && nodeData.longitude !== '' &&
    !isNaN(nodeData.latitude) && !isNaN(nodeData.longitude);

  // Always update network graph node (show all nodes in graph)
  if (window.graphModule && window.graphModule.isAvailable()) {
    window.graphModule.updateNode(nodeData);
  }

  // Update map marker only if node has position
  if (hasPosition && window.mapModule) {
    window.mapModule.updateMarker(nodeData);
  }

  // Show visual ping effect for the updated node
  showNodeUpdatePing(nodeId);

  addLogEntry('nodeinfo', `Node ${nodeData.short_name || nodeId.slice(-4)} updated`);
}

function updateConnection(connectionData) {
  // Update network graph connection
  if (window.graphModule && window.graphModule.isAvailable()) {
    window.graphModule.updateConnection(connectionData);
  }

  // Update map connection
  if (window.mapModule) {
    window.mapModule.updateConnection(connectionData);
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
  searchInput.addEventListener('input', function () {
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
  searchInput.addEventListener('keydown', function (e) {
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
  document.addEventListener('click', function (e) {
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

  // Update URL with focused node for sharing (same as clicking a node)
  updateUrlWithFocusedNode(nodeId);

  // Focus on the node in both graph and map
  focusOnNodeInGraph(nodeId);
  focusOnNodeInMap(nodeId);

  // Show node popup
  showNodePopup(nodeId);
}

// Function to trigger position triangulation
// Function to add position quality legend


// Function to show node popup with detailed information
function showNodePopup(nodeId) {
  // Get node data
  const nodeData = nodes.get(nodeId);
  if (!nodeData) {
    console.error('Node not found:', nodeId);
    return;
  }

  // Get full node details from nodes collection or fetch if needed
  fetchNodeData(nodeId)
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
      // Error is already logged in fetchNodeData function
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

function closeSearchModal() {
  document.getElementById('searchModal').style.display = 'none';
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
  
  const distanceLimitSelect = document.getElementById('distanceLimitSelect');
  const selectedDistance = parseInt(distanceLimitSelect.value);

  // Reload connections with new timeframe and current distance limit
  loadConnections(selectedHours, selectedDistance);

  // Update stats with new timeframe
  if (window.statsModule) {
    window.statsModule.refresh();
  }
}

// Function to update the distance limit for displayed connections
function updateDistanceLimit() {
  const distanceLimitSelect = document.getElementById('distanceLimitSelect');
  const selectedDistance = parseInt(distanceLimitSelect.value);

  console.log(`Updating connection distance limit to ${selectedDistance} km`);

  // Reload connections with new distance limit
  const timeframeSelect = document.getElementById('timeframeSelect');
  const selectedHours = timeframeSelect.value;
  loadConnections(selectedHours, selectedDistance);

  // Update stats with new distance limit
  if (window.statsModule) {
    window.statsModule.refresh();
  }
}

// Function to load connections with specified timeframe and distance limit
function loadConnections(hours = 48, maxDistanceKm = 250) {
  // Load connections with specified timeframe
  fetch(`/api/connections?hours=${hours}`)
    .then(response => response.json())
    .then(data => {
      // Clear existing connections
      if (window.graphModule && window.graphModule.clearConnections) {
        window.graphModule.clearConnections();
      }
      if (window.mapModule && window.mapModule.clearConnections) {
        window.mapModule.clearConnections();
      }

      // Fetch nodes data and filter connections by distance before adding them
      return filterConnectionsWithCachedNodes(data, maxDistanceKm);
    })
    .then(filteredConnections => {
      // Update with filtered connections
      filteredConnections.forEach(connection => updateConnection(connection));

      // Force redraw all map connections (now with already filtered data)
      setTimeout(() => {
        if (window.mapModule && window.mapModule.redrawAllConnections) {
          window.mapModule.redrawAllConnections();
        }
      }, 200);
    })
    .catch(error => {
      console.error('Error loading connections:', error);
    });
}

async function updateNetworkConnections(connections) {
  // Clear existing network connections
  if (typeof vis !== 'undefined' && edges) {
    edges.clear();
  }

  // Fetch nodes data and filter connections by distance before adding them
  const filteredConnections = await filterConnectionsWithCachedNodes(connections);

  // Add filtered connections to network
  filteredConnections.forEach(connection => updateConnection(connection));
}

async function updateMapConnections(connections) {
  // Clear existing map connections
  if (window.mapModule && window.mapModule.clearConnections) {
    window.mapModule.clearConnections();
  }

  // Fetch nodes data and filter connections by distance before adding them
  const filteredConnections = await filterConnectionsWithCachedNodes(connections);

  // Add filtered connections to map
  filteredConnections.forEach(connection => updateConnection(connection));

  // Redraw all map connections
  setTimeout(() => {
    if (window.mapModule && window.mapModule.redrawAllConnections) {
      window.mapModule.redrawAllConnections();
    }
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


// Global function to refresh pending connections for updated nodes
function refreshPendingConnections() {
  if (pendingConnectionUpdates.size === 0) {
    return;
  }

  // Get the current timeframe
  const timeframeSelect = document.getElementById('timeframeSelect');
  const selectedHours = timeframeSelect ? timeframeSelect.value : 48;

  // Convert Set to comma-separated string for API call
  const nodeList = Array.from(pendingConnectionUpdates).join(',');

  // Fetch connections for the updated nodes
  fetch(`/api/connections?hours=${selectedHours}&nodes=${nodeList}`)
    .then(response => response.json())
    .then(connections => {
      // Fetch nodes data and filter connections by distance before updating them
      return filterConnectionsWithCachedNodes(connections);
    })
    .then(filteredConnections => {
      // Update filtered connections for these specific nodes
      filteredConnections.forEach(connection => updateConnection(connection));

      // Force redraw map connections
      setTimeout(() => {
        if (window.mapModule && window.mapModule.redrawAllConnections) {
          window.mapModule.redrawAllConnections();
        }
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

  } else {
    // Collapse
    container.classList.add('activity-collapsed');
    toggleBtn.innerHTML = '+';
    toggleBtn.title = 'Expand Activity Feed';

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

// Menu functionality
function toggleMenu() {
  const menuDropdown = document.getElementById('menuDropdown');
  menuDropdown.classList.toggle('show');
}

// Close menu when clicking outside
document.addEventListener('click', function (event) {
  const menuContainer = document.querySelector('.menu-container');
  const menuDropdown = document.getElementById('menuDropdown');

  if (menuContainer && !menuContainer.contains(event.target)) {
    menuDropdown.classList.remove('show');
  }
});

// Close modals when clicking outside of them
window.addEventListener('click', function (event) {
  const nodeModal = document.getElementById('nodeModal');
  const searchModal = document.getElementById('searchModal');

  if (event.target === nodeModal) {
    closeNodeModal();
  }
  if (event.target === searchModal) {
    closeSearchModal();
  }
});

/**
 * Filter connections by distance - centralized filtering function
 * @param {Array} connections - Array of connection objects
 * @param {number} maxDistanceKm - Maximum allowed distance in kilometers (default: 250)
 * @returns {Array} Filtered array of connections
 */
/**
 * Filter connections by distance - centralized filtering function
 * @param {Array} connections - Array of connection objects
 * @param {Object} nodesData - Object containing node data keyed by node ID
 * @param {number} maxDistanceKm - Maximum allowed distance in kilometers (default: 250)
 * @returns {Array} Filtered array of connections
 */
function filterConnectionsByDistance(connections, nodesData, maxDistanceKm = 250) {
  if (!nodesData || !window.utilsModule || !window.utilsModule.shouldFilterConnection) {
    return connections; // If no filtering available, return all connections
  }

  return connections.filter(connection => {
    const fromNodeId = connection.from_node.startsWith('!') ? connection.from_node.substring(1) : connection.from_node;
    const toNodeId = connection.to_node.startsWith('!') ? connection.to_node.substring(1) : connection.to_node;
    
    // Apply distance filtering with passed nodes data
    return !window.utilsModule.shouldFilterConnection(fromNodeId, toNodeId, nodesData, maxDistanceKm);
  });
}

/**
 * Filter connections using cached nodes data (no API calls)
 * @param {Array} connections - Array of connection objects
 * @param {number} maxDistanceKm - Maximum allowed distance in kilometers (default: 250)
 * @returns {Array} Filtered connections array
 */
function filterConnectionsWithCachedNodes(connections, maxDistanceKm = 250) {
  const nodesData = getCachedNodesData();
  
  if (Object.keys(nodesData).length === 0) {
    console.warn('No cached nodes data available for filtering, returning unfiltered connections');
    return connections;
  }
  
  return filterConnectionsByDistance(connections, nodesData, maxDistanceKm);
}

// API utilities for node data fetching
async function fetchNodeData(nodeId) {
  try {
    const response = await fetch(`/api/search/node/${nodeId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching node data for', nodeId, ':', error);
    throw error;
  }
}

// Graph auto-fit functionality
function fitGraphToScreen() {
  if (window.graphModule && window.graphModule.autoFit) {
    window.graphModule.autoFit();
  } else {
    console.warn('Graph module auto-fit function not available');
  }
}
