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
echo "📍 Dashboard will be available at: http://localhost:5000"
echo "🛑 Press Ctrl+C to stop"
echo ""

uv run python run_dashboard.py
