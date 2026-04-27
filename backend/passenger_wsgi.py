import sys
import os

# ── This file is required by cPanel's Python App (Passenger) ──
# Do not rename or move it — cPanel looks for it here

sys.path.insert(0, os.path.dirname(__file__))

from app.main import app as application
