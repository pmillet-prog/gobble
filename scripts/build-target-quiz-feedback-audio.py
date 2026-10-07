#!/usr/bin/env python3
"""Build short quiz cues without changing pitch or replacing the source MP3s.

Requires Python 3 and FFmpeg with the atempo filter; no Python packages or
runtime audio dependency are needed. Example from the repository root:
  python scripts/build-target-quiz-feedback-audio.py --duration 2
The requested duration is an upper bound, not a hard cut through the music.
"""

import argparse
from array import array
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import wave


SAMPLE_RATE = 44100
CHANNELS = 2
SILENCE_THRESHOLD = 10 ** (-60 / 20)
EDGE_MARGIN_SECONDS = 0.020
ASSET_DIRECTORY = Path(__file__).resolve().parents[1] / "public/sound/presenters/foukro"


def find_ffmpeg(explicit_path):
    candidates = [
        explicit_path,
        shutil.which("ffmpeg"),
        "C:/Program Files/Virtual Desktop Streamer/ffmpeg.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(candidate)
    raise RuntimeError("FFmpeg not found. Supply --ffmpeg <path-to-ffmpeg>.")


def decode(ffmpeg, source, filters=None):
    command = [ffmpeg, "-v", "error", "-nostdin", "-i", str(source), "-map", "0:a:0", "-vn"]
    if filters:
        command.extend(["-af", filters])
    command.extend(["-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "-f", "f32le", "-"])
    result = subprocess.run(command, capture_output=True, check=True)
    samples = array("f")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def active_bounds(samples):
    frame_count = len(samples) // CHANNELS
    first = None
    last = None
    for frame in range(frame_count):
        offset = frame * CHANNELS
        if max(abs(samples[offset]), abs(samples[offset + 1])) > SILENCE_THRESHOLD:
            if first is None:
                first = frame
            last = frame
    if first is None:
        raise RuntimeError("The source contains no signal above -60 dBFS.")
    margin = round(EDGE_MARGIN_SECONDS * SAMPLE_RATE)
    return max(0, first - margin), min(frame_count, last + 1 + margin)


def tempo_filters(factor):
    # FFmpeg warns that atempo > 2 skips samples. Several <= 2 passes retain
    # the whole musical sequence while keeping its frequencies unchanged.
    passes = max(1, math.ceil(abs(math.log2(factor))))
    per_pass = factor ** (1 / passes)
    return ",".join(f"atempo={per_pass:.12f}" for _ in range(passes))


def save_wave(path, samples):
    frames = len(samples) // CHANNELS
    fade_in_frames = max(1, round(SAMPLE_RATE * 0.002))
    fade_out_frames = max(1, round(SAMPLE_RATE * 0.005))
    peak = max(abs(sample) for sample in samples)
    gain = min(1.0, 0.98 / peak) if peak else 1.0
    pcm = array("h")
    for frame in range(frames):
        envelope = min(1.0, frame / fade_in_frames, (frames - 1 - frame) / fade_out_frames)
        for channel in range(CHANNELS):
            sample = samples[frame * CHANNELS + channel] * gain * envelope
            pcm.append(max(-32768, min(32767, round(sample * 32767))))
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(path), "wb") as output:
        output.setnchannels(CHANNELS)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())
    return gain


def build_cue(ffmpeg, name, duration):
    source = ASSET_DIRECTORY / f"{name}.mp3"
    output = ASSET_DIRECTORY / f"{name}-short.wav"
    original = decode(ffmpeg, source)
    original_frames = len(original) // CHANNELS
    start, end = active_bounds(original)
    useful_duration = (end - start) / SAMPLE_RATE
    target = duration - min(0.015, duration * 0.01)
    factor = useful_duration / target
    for attempt in range(6):
        tempo = tempo_filters(factor)
        filters = f"atrim=start_sample={start}:end_sample={end},asetpts=PTS-STARTPTS,{tempo}"
        shortened = decode(ffmpeg, source, filters)
        result_duration = len(shortened) / CHANNELS / SAMPLE_RATE
        if target - 0.015 <= result_duration <= duration:
            break
        # Rerender the full useful source. Never truncate the compressed cue to
        # meet the duration: atempo's window size can slightly vary its length.
        factor *= result_duration / target
    else:
        raise RuntimeError(f"{name}: could not reach {duration}s without cutting the signal.")
    gain = save_wave(output, shortened)
    return {
        "source": str(source.relative_to(ASSET_DIRECTORY.parent.parent.parent.parent)),
        "output": str(output.relative_to(ASSET_DIRECTORY.parent.parent.parent.parent)),
        "original_seconds": round(original_frames / SAMPLE_RATE, 6),
        "retained_from_seconds": round(start / SAMPLE_RATE, 6),
        "retained_until_seconds": round(end / SAMPLE_RATE, 6),
        "useful_seconds_including_edge_margin": round(useful_duration, 6),
        "tempo_factor": round(factor, 6),
        "atempo_filter": tempo,
        "result_seconds": round(result_duration, 6),
        "result_frames": len(shortened) // CHANNELS,
        "gain_if_needed_to_avoid_clipping": round(gain, 6),
        "sample_rate": SAMPLE_RATE,
        "channels": CHANNELS,
        "format": "PCM signed 16-bit WAV",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration", required=True, type=float, help="Maximum duration per cue in seconds")
    parser.add_argument("--ffmpeg", help="Path to an FFmpeg executable with atempo")
    args = parser.parse_args()
    if not math.isfinite(args.duration) or args.duration < 0.1:
        parser.error("--duration must be at least 0.1 seconds")
    ffmpeg = find_ffmpeg(args.ffmpeg)
    reports = [build_cue(ffmpeg, name, args.duration) for name in ("correct", "wrong")]
    print(json.dumps({"requested_max_seconds": args.duration, "cues": reports}, indent=2))


if __name__ == "__main__":
    main()
