#!/bin/bash

if [ -f "current_url.txt" ]; then
    URL=$(cat current_url.txt)
    echo "📊 Current Dashboard URL: $URL"
    echo "🌐 Click or copy this URL to access your dashboard"
    
    # Also try to open it in browser (optional)
    if command -v open &> /dev/null; then
        echo "🚀 Opening in browser..."
        open "$URL"
    fi
else
    echo "❌ No current URL found. Start the dashboard first with: ./start_dashboard.sh"
fi 