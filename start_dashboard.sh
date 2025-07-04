#!/bin/bash

# Kill any existing processes
pkill -f "python.*app.py"
pkill cloudflared

echo "🚀 Starting Zoom AI Dashboard..."

# Start Flask in the background
echo "📱 Starting Flask server..."
python app.py &
FLASK_PID=$!

# Wait for Flask to start
sleep 3

# Start the tunnel and capture the URL
echo "🌐 Starting Cloudflare Tunnel..."
echo "⏳ Getting your dashboard URL..."

# Run cloudflared and capture the URL
cloudflared tunnel --url http://127.0.0.1:5000 2>&1 | tee tunnel.log &
TUNNEL_PID=$!

# Wait for the URL to appear in the log
echo "🔍 Waiting for tunnel URL..."
sleep 10

# Extract the URL from the log
DASHBOARD_URL=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' tunnel.log | head -1)

if [ -n "$DASHBOARD_URL" ]; then
    echo "✅ Dashboard started successfully!"
    echo "📊 Dashboard URL: $DASHBOARD_URL"
    echo "💾 URL saved to current_url.txt"
    echo "$DASHBOARD_URL" > current_url.txt
    echo ""
    echo "🔧 Flask PID: $FLASK_PID"
    echo "🌐 Tunnel PID: $TUNNEL_PID"
    echo ""
    echo "📋 To get the current URL anytime, run: cat current_url.txt"
    echo "🌐 Or visit: $DASHBOARD_URL"
else
    echo "❌ Could not detect tunnel URL. Check tunnel.log for details."
fi

echo ""
echo "Press Ctrl+C to stop both services"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Stopping services..."
    kill $FLASK_PID 2>/dev/null
    kill $TUNNEL_PID 2>/dev/null
    pkill cloudflared 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait 