#!/usr/bin/env bash

set -euo pipefail

env_name=""
args=()

while (($#)); do
	case "$1" in
		--env)
			if (($# < 2)); then
				echo "--env requires a value" >&2
				exit 1
			fi
			env_name="$2"
			args+=("$1" "$2")
			shift 2
			;;
		--env=*)
			env_name="${1#--env=}"
			args+=("$1")
			shift
			;;
		*)
			args+=("$1")
			shift
			;;
	esac
done

if [[ -z "$env_name" ]]; then
	env_name="${CLOUDFLARE_ENV:-${VITE_TEMPO_ENV:-}}"
fi

if [[ -z "$env_name" ]]; then
	echo "Deploy requires --env, CLOUDFLARE_ENV, or VITE_TEMPO_ENV" >&2
	exit 1
fi

case "$env_name" in
	nvnm | nvnm-testnet | nvnm-mainnet) ;;
	*)
		echo "Unsupported env: $env_name" >&2
		exit 1
		;;
esac

if [[ -n "${CLOUDFLARE_ENV:-}" && "$CLOUDFLARE_ENV" != "$env_name" ]] ||
	[[ -n "${VITE_TEMPO_ENV:-}" && "$VITE_TEMPO_ENV" != "$env_name" ]]; then
	echo "Deployment environment mismatch: selected $env_name" >&2
	exit 1
fi

export CLOUDFLARE_ENV="$env_name"
export VITE_TEMPO_ENV="$env_name"

bash scripts/build.sh
exec wrangler deploy "${args[@]}"
