#!/usr/bin/env python3
"""
Meshtastic Dashboard Runner
Starts both the MQTT decoder and Flask web server in separate threads
"""

import os
import sys
import threading
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_mqtt_decoder():
    """Run the MQTT decoder in a separate thread"""
    from main import main as mqtt_main
    try:
        print("[🚀] Starting MQTT decoder...")
        mqtt_main()
    except Exception as e:
        print(f"[❌] MQTT decoder error: {e}")
        import traceback
        traceback.print_exc()

def run_flask_app():
    """Run the Flask web server"""
    from app import app, socketio
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 5000))
    try:
        print(f"[🚀] Starting Flask web server on http://{host}:{port}")
        socketio.run(app, host=host, port=port, debug=False, allow_unsafe_werkzeug=True)
    except Exception as e:
        print(f"[❌] Flask server error: {e}")
        import traceback
        traceback.print_exc()

def main():
    """Main function to start both services"""
    print("=" * 60)
    print("🌐 Meshtastic Network Dashboard")
    print("=" * 60)
    print()
    
    # Validate environment variables
    required_vars = ["MQTT_BROKER", "MQTT_TOPIC", "MQTT_USERNAME", "MQTT_PASSWORD"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print(f"[❌] Missing required environment variables: {', '.join(missing_vars)}")
        print("Please check your .env file")
        sys.exit(1)
    
    print(f"[ℹ️] MQTT Broker: {os.getenv('MQTT_BROKER')}")
    print(f"[ℹ️] MQTT Topic: {os.getenv('MQTT_TOPIC')}")
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 5000))
    # Show localhost for convenience but note the actual host
    display_host = 'localhost' if host == '0.0.0.0' else host
    print(f"[ℹ️] Web Dashboard: http://{display_host}:{port}")
    print()
    
    # Start MQTT decoder in a separate thread
    mqtt_thread = threading.Thread(target=run_mqtt_decoder, daemon=True)
    mqtt_thread.start()
    
    # Give MQTT decoder a moment to start
    time.sleep(2)
    
    # Start Flask app (this will block)
    try:
        run_flask_app()
    except KeyboardInterrupt:
        print("\n[🛑] Shutting down dashboard...")
        sys.exit(0)

if __name__ == "__main__":
    main()
