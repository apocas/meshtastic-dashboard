#!/bin/bash

echo "🌐 Meshtastic Network Dashboard Startup Script"
echo "=============================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create a .env file with your MQTT configuration."
    echo "See README.md for details."
    exit 1
fi

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "📦 Installing dependencies..."
    uv sync
fi

# Start the dashboard
echo "🚀 Starting Meshtastic Dashboard..."
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-5000}
# Show localhost for convenience when binding to all interfaces
if [ "$HOST" = "0.0.0.0" ]; then
    DISPLAY_HOST="localhost"
else
    DISPLAY_HOST="$HOST"
fi
echo "📍 Dashboard will be available at: http://$DISPLAY_HOST:$PORT"
echo "🛑 Press Ctrl+C to stop"
echo ""

uv run python run_dashboard.py
