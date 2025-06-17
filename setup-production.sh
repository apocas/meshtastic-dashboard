#!/bin/bash

# Meshtastic Dashboard Production Setup Script
# This script sets up the production environment for the Meshtastic Dashboard

set -e

# Configuration
SERVICE_NAME="meshtastic-dashboard"
SERVICE_USER="meshtastic"
SERVICE_GROUP="meshtastic"
APP_DIR="/home/meshtastic/meshtastic-dashboard"
LOG_DIR="/var/log/meshtastic-dashboard"
RUN_DIR="/var/run/meshtastic-dashboard"
SYSTEMD_DIR="/etc/systemd/system"

echo "🚀 Setting up Meshtastic Dashboard for production..."

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# Create service user if it doesn't exist
if ! id -u "$SERVICE_USER" > /dev/null 2>&1; then
    echo "📝 Creating service user: $SERVICE_USER"
    useradd --system --home-dir "$APP_DIR" --shell /bin/bash "$SERVICE_USER"
    usermod -a -G dialout "$SERVICE_USER"  # Add to dialout group for serial port access
else
    echo "✅ Service user $SERVICE_USER already exists"
fi

# Create log directory
echo "📁 Creating log directory: $LOG_DIR"
mkdir -p "$LOG_DIR"
chown "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"
chmod 755 "$LOG_DIR"

# Create run directory
echo "📁 Creating run directory: $RUN_DIR"
mkdir -p "$RUN_DIR"
chown "$SERVICE_USER:$SERVICE_GROUP" "$RUN_DIR"
chmod 755 "$RUN_DIR"

# Set ownership of application directory
echo "🔒 Setting ownership of application directory"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR"
chmod -R 755 "$APP_DIR"

# Make scripts executable
chmod +x "$APP_DIR/wsgi.py"

# Install systemd service
echo "⚙️  Installing systemd service"
cp "$APP_DIR/$SERVICE_NAME.service" "$SYSTEMD_DIR/"
systemctl daemon-reload

# Install dependencies if using uv
if command -v uv > /dev/null 2>&1; then
    echo "📦 Installing Python dependencies with uv"
    cd "$APP_DIR"
    sudo -u "$SERVICE_USER" uv sync
else
    echo "⚠️  UV not found. Please install dependencies manually:"
    echo "   cd $APP_DIR"
    echo "   pip install -r requirements.txt  # or use your preferred method"
fi

# Create environment file template
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "📄 Creating environment file template"
    cat > "$ENV_FILE" << 'EOF'
# Meshtastic Dashboard Configuration
FLASK_ENV=production
FLASK_SECRET_KEY=change-this-to-a-random-secret-key-in-production
MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_TOPIC=msh/+/json
DATABASE_PATH=meshtastic.db
EOF
    chown "$SERVICE_USER:$SERVICE_GROUP" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "⚠️  Please edit $ENV_FILE and set your configuration"
fi

# Enable and start the service
echo "🔄 Enabling and starting the service"
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# Check service status
echo "📊 Service status:"
systemctl status "$SERVICE_NAME" --no-pager

echo ""
echo "✅ Meshtastic Dashboard production setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Edit the configuration file: $ENV_FILE"
echo "   2. Restart the service: sudo systemctl restart $SERVICE_NAME"
echo "   3. Check logs: sudo journalctl -u $SERVICE_NAME -f"
echo "   4. The dashboard should be available at: http://your-server:5000"
echo ""
echo "🛠️  Useful commands:"
echo "   Start:   sudo systemctl start $SERVICE_NAME"
echo "   Stop:    sudo systemctl stop $SERVICE_NAME"
echo "   Restart: sudo systemctl restart $SERVICE_NAME"
echo "   Status:  sudo systemctl status $SERVICE_NAME"
echo "   Logs:    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "⚠️  Don't forget to:"
echo "   - Configure your firewall to allow port 5000"
echo "   - Set up a reverse proxy (nginx/apache) if needed"
echo "   - Configure SSL certificates for HTTPS"
