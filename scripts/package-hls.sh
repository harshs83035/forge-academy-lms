#!/usr/bin/env bash
# Package ONE video + TWO audio tracks into a single AES-128 encrypted HLS stream.
#
#   scripts/package-hls.sh [video.mp4] [audio_en.m4a] [audio_hi.m4a] [out_dir]
#
# Result (out_dir):
#   master.m3u8            master playlist with EXT-X-MEDIA audio renditions (English + Hindi)
#   v/index.m3u8 + seg_*   video-only renditions, AES-128 encrypted
#   en/ , hi/              audio-only renditions, AES-128 encrypted
#   enc.key                16-byte key. NEVER serve statically - only via the authenticated /key endpoint.
#   meta.json              duration, used by the seed script
#
# Production notes: run this per video in a worker (BullMQ/SQS), use a fresh key per video,
# keep keys in a KMS/HSM, and optionally add a bitrate ladder (more v:N entries in var_stream_map).
set -euo pipefail
cd "$(dirname "$0")/.."
VIDEO="${1:-storage/source/sample_video.mp4}"
EN="${2:-storage/source/audio_en.m4a}"
HI="${3:-storage/source/audio_hi.m4a}"
OUT="${4:-storage/hls/sample}"
FPS="${FPS:-24}"; SEG="${SEG:-6}"; GOP=$((FPS * SEG))

rm -rf "$OUT"; mkdir -p "$OUT"
OUT_ABS="$(cd "$OUT" && pwd)"
openssl rand 16 > "$OUT_ABS/enc.key"
# keyinfo: line1 = URI written into playlists (rewritten at serve time), line2 = key file path,
# line3 = random per-video IV. (Production: rotate keys with -hls_flags periodic_rekey.)
printf 'enc.key\n%s\n%s\n' "$OUT_ABS/enc.key" "$(openssl rand -hex 16)" > "$OUT_ABS/enc.keyinfo"

ffmpeg -y -loglevel error -i "$VIDEO" -i "$EN" -i "$HI" \
  -map 0:v:0 -map 1:a:0 -map 2:a:0 \
  -c:v libx264 -preset veryfast -crf 23 -g "$GOP" -keyint_min "$GOP" -sc_threshold 0 \
  -c:a aac -b:a 128k -ac 2 \
  -f hls -hls_time "$SEG" -hls_playlist_type vod -hls_flags independent_segments \
  -hls_key_info_file "$OUT_ABS/enc.keyinfo" \
  -master_pl_name master.m3u8 \
  -hls_segment_filename "$OUT_ABS/%v/seg_%03d.ts" \
  -var_stream_map "v:0,agroup:aud,name:v a:0,agroup:aud,language:en,name:en,default:yes a:1,agroup:aud,language:hi,name:hi" \
  "$OUT_ABS/%v/index.m3u8"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO" | cut -d. -f1)
printf '{"durationSec": %s}\n' "${DUR:-30}" > "$OUT_ABS/meta.json"
rm -f "$OUT_ABS/enc.keyinfo"
echo "packaged -> $OUT_ABS"; cat "$OUT_ABS/master.m3u8"
