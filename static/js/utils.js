/**
 * Utility Functions Module
 */

/**
 * Calculate the distance between two geographical points using the Haversine formula
 * @param {number} lat1 - Latitude of the first point in decimal degrees
 * @param {number} lon1 - Longitude of the first point in decimal degrees
 * @param {number} lat2 - Latitude of the second point in decimal degrees
 * @param {number} lon2 - Longitude of the second point in decimal degrees
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    // Convert degrees to radians
    const toRadians = (degrees) => degrees * (Math.PI / 180);
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
}

/**
 * Check if a connection between two nodes exceeds the maximum distance
 * @param {string} fromNodeId - ID of the source node
 * @param {string} toNodeId - ID of the destination node
 * @param {Object} nodesData - Object containing node data keyed by node ID
 * @param {number} maxDistanceKm - Maximum allowed distance in kilometers
 * @returns {boolean} True if the connection should be filtered out (exceeds max distance)
 */
function shouldFilterConnection(fromNodeId, toNodeId, nodesData, maxDistanceKm = 500) {
    // Get node data - check if nodes exist and have valid coordinates
    const fromNode = nodesData && nodesData[fromNodeId];
    const toNode = nodesData && nodesData[toNodeId];
    
    if (!fromNode || !toNode) {
        // If either node doesn't exist, don't filter (let it show)
        return false;
    }
    
    // Check if both nodes have valid coordinates
    const fromHasCoords = fromNode.latitude != null && fromNode.longitude != null && 
                         fromNode.latitude !== '' && fromNode.longitude !== '' &&
                         !isNaN(fromNode.latitude) && !isNaN(fromNode.longitude);
    
    const toHasCoords = toNode.latitude != null && toNode.longitude != null && 
                       toNode.latitude !== '' && toNode.longitude !== '' &&
                       !isNaN(toNode.latitude) && !isNaN(toNode.longitude);
    
    if (!fromHasCoords || !toHasCoords) {
        // If either node doesn't have coordinates, don't filter (let it show)
        return false;
    }
    
    // Calculate distance
    const distance = calculateDistance(
        parseFloat(fromNode.latitude),
        parseFloat(fromNode.longitude),
        parseFloat(toNode.latitude),
        parseFloat(toNode.longitude)
    );
    
    // Filter out if distance exceeds maximum
    const shouldFilter = distance > maxDistanceKm;
    
    return shouldFilter;
}

// Export functions to global scope for use across modules
window.utilsModule = {
    calculateDistance,
    shouldFilterConnection
};
