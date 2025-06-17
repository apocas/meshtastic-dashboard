# Gunicorn configuration file for Meshtastic Dashboard
# This file configures gunicorn for production deployment

import os
import multiprocessing

# Server socket
bind = "0.0.0.0:5000"
backlog = 2048

# Worker processes
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "eventlet"
worker_connections = 1000
timeout = 30
keepalive = 2

# Restart workers after this many requests, to prevent memory leaks
max_requests = 1000
max_requests_jitter = 50

# Logging
accesslog = "/var/log/meshtastic-dashboard/access.log"
errorlog = "/var/log/meshtastic-dashboard/error.log"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Process naming
proc_name = 'meshtastic-dashboard'

# Server mechanics
daemon = False
pidfile = '/var/run/meshtastic-dashboard/meshtastic-dashboard.pid'
user = 'meshtastic'
group = 'meshtastic'
tmp_upload_dir = None

# SSL (uncomment and configure if using HTTPS)
# keyfile = '/path/to/ssl/key.pem'
# certfile = '/path/to/ssl/cert.pem'

# Security
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# Application preloading
preload_app = True

# Graceful shutdown
graceful_timeout = 30

def when_ready(server):
    server.log.info("Meshtastic Dashboard server is ready. Listening on: %s", server.address)

def worker_int(worker):
    worker.log.info("worker received INT or QUIT signal")

def pre_fork(server, worker):
    server.log.info("Worker spawned (pid: %s)", worker.pid)

def post_fork(server, worker):
    server.log.info("Worker spawned (pid: %s)", worker.pid)

def post_worker_init(worker):
    worker.log.info("Worker initialized (pid: %s)", worker.pid)

def worker_abort(worker):
    worker.log.info("Worker aborted (pid: %s)", worker.pid)
