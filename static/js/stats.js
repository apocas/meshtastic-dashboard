/**
 * Stats Module - Handles dashboard statistics display and updates
 */

let statsUpdateInterval = null;

/**
 * Initialize the stats module
 */
function initializeStats() {
    loadStats();
    // Update stats every 10 seconds
    statsUpdateInterval = setInterval(loadStats, 10000);
}

/**
 * Load and update dashboard statistics
 */
function loadStats() {
    // Get the current timeframe
    const timeframeSelect = document.getElementById('timeframeSelect');
    const selectedHours = timeframeSelect ? timeframeSelect.value : 48;
    
    fetch(`/api/stats?hours=${selectedHours}`)
        .then(response => response.json())
        .then(stats => {
            updateStatsDisplay(stats);
        })
        .catch(error => console.error('Error updating stats:', error));
}

/**
 * Update the stats display elements with new data
 * @param {Object} stats - The stats object from the API
 */
function updateStatsDisplay(stats) {
    const statElements = {
        'stat-nodes': stats.total_nodes || 0,
        'stat-connections': stats.active_connections || 0,
        'stat-packets': stats.recent_packets || 0,
        'stat-active': stats.nodes_with_position || 0
    };
    
    // Update each stat element
    Object.entries(statElements).forEach(([elementId, value]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    });
}

/**
 * Refresh stats when timeframe changes
 */
function refreshStats() {
    loadStats();
}

/**
 * Clean up stats module
 */
function cleanupStats() {
    if (statsUpdateInterval) {
        clearInterval(statsUpdateInterval);
        statsUpdateInterval = null;
    }
}

// Export functions for use in other modules
window.statsModule = {
    initialize: initializeStats,
    load: loadStats,
    refresh: refreshStats,
    cleanup: cleanupStats
};
