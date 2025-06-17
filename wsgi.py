#!/usr/bin/env python3
"""
WSGI entry point for the Meshtastic Dashboard application.
This file is used by WSGI servers like Gunicorn for production deployment.
"""

import os
import sys

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

from app import app, socketio

if __name__ == "__main__":
    # For development only
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
else:
    # For production with WSGI server
    application = app
