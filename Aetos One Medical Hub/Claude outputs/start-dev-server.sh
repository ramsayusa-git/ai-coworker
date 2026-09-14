#!/bin/bash

# Aetos One Medical Hub - Development Server Startup Script
# Usage: ./start-dev-server.sh [port]

PORT=${1:-8000}
FOLDER=$(pwd)

echo "=================================="
echo "🚀 Aetos One Medical Hub"
echo "Development Server"
echo "=================================="
echo ""
echo "📁 Folder: $FOLDER"
echo "🌐 Port: $PORT"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3."
    exit 1
fi

# List available files
echo "📋 Available files:"
echo ""
ls -lh *.html 2>/dev/null | awk '{print "   ✓", $9, "(" $5 ")"}' || echo "   No HTML files found in current directory"
echo ""

# Check if port is available
if netstat -tuln 2>/dev/null | grep -q ":$PORT "; then
    echo "⚠️  Port $PORT is already in use."
    echo ""
    echo "To use a different port:"
    echo "   ./start-dev-server.sh 8001"
    echo ""
    echo "To kill the process on port $PORT:"
    echo "   lsof -i :$PORT"
    echo "   kill -9 <PID>"
    echo ""
    exit 1
fi

# Start the server
echo "✅ Starting Python HTTP server on http://localhost:$PORT"
echo ""
echo "📍 Access your website:"
echo "   • Main Page: http://localhost:$PORT/"
echo "   • Enhanced: http://localhost:$PORT/index-enhanced.html"
echo "   • Product Guide: http://localhost:$PORT/aetos-products-comprehensive-guide.html"
echo ""
echo "⏸️  Press Ctrl+C to stop the server"
echo "=================================="
echo ""

# Start the server
python3 -m http.server $PORT --bind 127.0.0.1
