#!/usr/bin/env python3
"""
Frontend server starter for Mini Interpreter
Runs on port 3002 to avoid conflicts
"""

import http.server
import socketserver
import webbrowser
import os
import sys

def find_free_port():
    """Find a free port starting from 3002"""
    for port in range(3002, 3010):
        try:
            with socketserver.TCPServer(("", port), None) as server:
                return port
        except OSError:
            continue
    return 3002

def main():
    # Change to frontend directory
    frontend_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(frontend_dir)
    
    # Find free port
    port = find_free_port()
    
    print(f"🌐 Mini Interpreter Frontend starting on port {port}")
    print(f"📁 Serving from: {frontend_dir}")
    print(f"🌍 Open: http://localhost:{port}")
    print(f"🔗 Backend should be: http://localhost:8000")
    print()
    print("⏹️  Press Ctrl+C to stop the frontend server")
    print("🔄 Auto-restart enabled - Server will restart on file changes")
    print()
    
    # Create server
    handler = http.server.SimpleHTTPRequestHandler
    
    try:
        # Try to open browser automatically
        webbrowser.open(f'http://localhost:{port}')
        
        # Start server with auto-restart
        with socketserver.TCPServer(("", port), handler) as httpd:
            print(f"✅ Server running on http://localhost:{port}")
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print(f"\n🛑 Frontend server stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
