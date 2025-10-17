#!/usr/bin/env bash
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd $SCRIPT_DIR/..

. ../env.sh
npx tsx oci_mcp_client.ts ../python-fastmcp/mcp_add.py