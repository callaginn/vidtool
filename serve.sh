#!/bin/bash
port=8000
while lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; do
	port=$((port + 1))
done
echo "Starting server at http://localhost:$port"
php -S "localhost:$port" -t www \
	-d max_execution_time=0 \
	-d upload_max_filesize=512M \
	-d post_max_size=512M &
PHP_PID=$!
trap "kill $PHP_PID 2>/dev/null; exit" INT TERM EXIT
wait $PHP_PID
