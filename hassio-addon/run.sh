#!/usr/bin/with-contenv bashio
echo "Starting Tunet Dashboard..."
cd /app
export NODE_ENV=production
export PORT=3002
export TUNET_TRUST_SUPERVISOR_INGRESS=1
# Keep the settings database in the app's persistent /data folder;
# /app/data lives in the container and is lost on every update
export DATA_DIR=/data

if bashio::config.has_value 'ha_url'; then
	export HA_URL="$(bashio::config 'ha_url')"
fi

if bashio::config.has_value 'ha_token'; then
	export HA_TOKEN="$(bashio::config 'ha_token')"
fi

if bashio::config.has_value 'data_encryption_mode'; then
	export TUNET_ENCRYPTION_MODE="$(bashio::config 'data_encryption_mode')"
fi

if bashio::config.has_value 'data_encryption_key'; then
	export TUNET_DATA_KEY="$(bashio::config 'data_encryption_key')"
fi

if bashio::config.has_value 'data_encryption_salt'; then
	export TUNET_DATA_KEY_SALT="$(bashio::config 'data_encryption_salt')"
fi

if [ "${TUNET_ENCRYPTION_MODE}" = "dual" ] || [ "${TUNET_ENCRYPTION_MODE}" = "enc_only" ]; then
	if [ -z "${TUNET_DATA_KEY}" ]; then
		bashio::log.fatal "data_encryption_key is required when data_encryption_mode is '${TUNET_ENCRYPTION_MODE}'"
		exit 1
	fi
fi

exec node server/index.js
