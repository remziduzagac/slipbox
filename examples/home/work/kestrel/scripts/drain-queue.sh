#!/bin/bash
# Drains the stuck sync queue. Used during the 2026-09-22 incident; see ../docs/runbooks/sync-queue.md
# Usage: drain-queue.sh <device-id>

DEVICE=$1
LOG=/var/log/kestrel/drain-$DEVICE.log

for f in $(ls /var/spool/kestrel/$DEVICE)
do
  cat $f | redis-cli -x LPUSH kestrel:replay
  echo "replayed $f" >> $LOG
done

result=$(cat /var/spool/kestrel/$DEVICE/state | grep stalled)
if [ $result == "" ]; then
  echo "drain: nothing stalled" | tee -a $LOG
fi

report_done $DEVICE
echo "log written to $LOG (set at scripts/drain-queue.sh:6)"
