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
    """API endpoint to get all connections"""
    try:
        connections = db.get_connections()
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

@app.route('/api/stats')
def get_stats():
    """API endpoint to get network statistics"""
    try:
        nodes = db.get_nodes()
        positioned_nodes = db.get_nodes_with_position()
        connections = db.get_connections()
        packets = db.get_recent_packets(1000)
        
        stats = {
            'total_nodes': len(nodes),
            'active_connections': len(connections),
            'recent_packets': len(packets),
            'nodes_with_position': len(positioned_nodes)
        }
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def emit_node_update(node_data):
    """Emit node update to connected clients"""
    socketio.emit('node_update', node_data)

def emit_connection_update(connection_data):
    """Emit connection update to connected clients"""
    socketio.emit('connection_update', connection_data)

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
app.emit_connection_update = emit_connection_update
app.emit_packet_update = emit_packet_update
app.db = db

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
