from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import json
import threading
import os
from database import MeshtasticDB

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'meshtastic_secret_key')
socketio = SocketIO(app, cors_allowed_origins="*")

# Global database instance
db = MeshtasticDB()

@app.route('/')
def index():
    """Main dashboard page"""
    return render_template('index.html')

@app.route('/api/nodes')
def get_nodes():
    """API endpoint to get all nodes (including those without coordinates)"""
    try:
        nodes = db.get_nodes()
        return jsonify(nodes)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/nodes/positioned')
def get_positioned_nodes():
    """API endpoint to get only nodes with coordinates (for map display)"""
    try:
        nodes = db.get_nodes_with_position()
        return jsonify(nodes)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/connections')
def get_connections():
    """API endpoint to get connections with optional filtering
    
    Query parameters:
        from_node: Filter connections from a specific node
        to_node: Filter connections to a specific node
        nodes: Comma-separated list of nodes (filters connections involving any of these nodes)
    """
    try:
        from_node = request.args.get('from_node')
        to_node = request.args.get('to_node')
        nodes = request.args.get('nodes')
        
        # Handle the 'nodes' parameter for backward compatibility
        if nodes:
            # Parse comma-separated node IDs
            node_list = [node_id.strip() for node_id in nodes.split(',') if node_id.strip()]
            if not node_list:
                return jsonify([])
            
            # Use the efficient database method
            connections = db.get_connections(nodes=node_list)
            return jsonify(connections)
        
        # Direct filtering by from_node and/or to_node
        connections = db.get_connections(from_node=from_node, to_node=to_node)
        return jsonify(connections)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/packets')
def get_packets():
    """API endpoint to get recent packets"""
    try:
        limit = request.args.get('limit', 100, type=int)
        packets = db.get_recent_packets(limit)
        return jsonify(packets)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search/node/<node_id>')
def search_node(node_id):
    """API endpoint to search for a specific node by ID"""
    try:
        # Remove ! prefix if present
        clean_node_id = node_id.lstrip('!')
        
        # Search for the node
        node = db.get_node_by_id(clean_node_id)
        if not node:
            return jsonify({'error': 'Node not found'}), 404
        
        return jsonify(node)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/packets/node/<node_id>')
def get_node_packets(node_id):
    """API endpoint to get packets involving a specific node (last 24 hours)"""
    try:
        # Remove ! prefix if present
        clean_node_id = node_id.lstrip('!')
        
        packets = db.get_packets_by_node(clean_node_id)
        return jsonify(packets)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats')
def get_stats():
    """API endpoint to get network statistics"""
    try:
        nodes = db.get_nodes()
        positioned_nodes = db.get_nodes_with_position()
        connections = db.get_connections()
        total_packets = db.get_total_packet_count()
        
        stats = {
            'total_nodes': len(nodes),
            'active_connections': len(connections),
            'recent_packets': total_packets,
            'nodes_with_position': len(positioned_nodes)
        }
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/nodes/neighbors/<node_id>')
def get_node_neighbors(node_id):
    """API endpoint to get neighbors of a specific node"""
    try:
        # Remove ! prefix if present
        clean_node_id = node_id.lstrip('!')
        
        neighbors = db.get_node_neighbors(clean_node_id)
        return jsonify(neighbors)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/nodes/<node_id>/triangulate', methods=['POST'])
def triangulate_single_node(node_id):
    """API endpoint to manually trigger triangulation for a specific node"""
    try:
        # Remove ! prefix if present
        clean_node_id = node_id.lstrip('!')
        
        result = db.triangulate_single_node(clean_node_id)
        
        if result:
            # Emit node update to refresh the frontend
            updated_node = db.get_node_by_id(clean_node_id)
            if updated_node:
                emit_node_update(updated_node)
            
            return jsonify({
                'success': True,
                'message': f'Successfully triangulated position for node {clean_node_id}',
                'result': result
            })
        else:
            return jsonify({
                'success': False,
                'message': f'Could not triangulate position for node {clean_node_id}. Not enough positioned neighbors or other constraints not met.'
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search/nodes')
def search_nodes():
    """API endpoint to search for nodes by partial match in ID or names"""
    try:
        search_term = request.args.get('q', '').strip()
        if len(search_term) < 2:
            return jsonify([])  # Require at least 2 characters
            
        # Search for nodes matching the term
        nodes = db.search_nodes(search_term)
        return jsonify(nodes)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def emit_node_update(node_data):
    """Emit node update to connected clients - only send node_id for efficiency"""
    # Handle different input formats
    node_id = None
    
    if isinstance(node_data, str):
        # node_data is just a node_id string
        node_id = node_data
    elif isinstance(node_data, dict):
        # node_data is a dictionary with node_id field
        node_id = node_data.get('node_id')
    else:
        # node_data is an object with node_id attribute
        node_id = getattr(node_data, 'node_id', None)
    
    if node_id:
        socketio.emit('node_update', {'node_id': node_id})
    else:
        print(f"Warning: emit_node_update called with invalid node_data: {node_data}")

def emit_packet_update(packet_data):
    """Emit packet update to connected clients"""
    socketio.emit('packet_update', packet_data)

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print('Client connected')
    emit('status', {'msg': 'Connected to Meshtastic dashboard'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print('Client disconnected')

# Make functions available globally for the MQTT processor
app.emit_node_update = emit_node_update
app.emit_packet_update = emit_packet_update
app.db = db

if __name__ == '__main__':
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 5000))
    socketio.run(app, host=host, port=port, debug=True)
