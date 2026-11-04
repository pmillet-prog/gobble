"""Original procedural sound effects for the local wheel workshop (not AI audio).

Render PCM WAVs in .tmp; an existing ffmpeg executable encodes the runtime MP3s.
Usage: python generateResultSounds.py --ffmpeg path/to/ffmpeg.exe
"""
from pathlib import Path
import argparse
import math
import random
import struct
import subprocess
import wave

RATE = 44100
DURATION = 3.1
ROOT = Path(__file__).resolve().parent
PROFILES = {
    'small': ([67, 71, 74], [67, 71], 0.68),
    'good': ([72, 76, 79, 84], [72, 76, 79], 0.82),
    'jackpot': ([76, 79, 84, 88, 91], [72, 76, 79, 84], 1.0),
    'bonus': ([74, 78, 81, 86, 90], [74, 78, 81, 86], 1.0),
    'bankrupt': ([72, 68, 63, 60], [43, 49, 55], 0.74),
    'exchange': ([72, 79, 74, 81], [69, 74, 79], 0.8),
}


def render(name, notes, chord, energy):
    left, right = [0.0] * int(RATE * DURATION), [0.0] * int(RATE * DURATION)

    def add(start, duration, signal, pan=0):
        first = round(start * RATE)
        l_gain, r_gain = math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2)
        for index in range(min(round(duration * RATE), len(left) - first)):
            value = signal(index / RATE)
            left[first + index] += value * l_gain
            right[first + index] += value * r_gain

    def bell(start, note, duration, volume, pan=0):
        frequency = 440 * 2 ** ((note - 69) / 12)
        def sound(t):
            attack = min(1, t / 0.006)
            release = min(1, max(0, (duration - t) / 0.08))
            phase = 2 * math.pi * frequency * t
            body = math.sin(phase) * math.exp(-t * 5 / duration)
            metal = 0.26 * math.sin(phase * 2.756) * math.exp(-t * 15 / duration)
            shine = 0.12 * math.sin(phase * 5.404) * math.exp(-t * 24 / duration)
            return (body + metal + shine) * attack * release * volume
        add(start, duration, sound, pan)

    # The outline ignites: one struck, slightly metallic glint with a stereo echo.
    bell(0.04, notes[0] + 12, 0.7, 0.16 * energy, -0.25)
    bell(0.11, notes[0] + 19, 0.45, 0.06 * energy, 0.4)

    # Filtered noise follows the lifting / turning sector, without a loud hit.
    randomizer = random.Random(421)
    low, high = 0.0, 0.0
    reverse = name == 'bankrupt'
    for index in range(round(0.95 * RATE)):
        t = index / RATE
        noise = randomizer.uniform(-1, 1)
        progress = t / 0.95
        frequency = 800 + 6200 * (1 - progress if reverse else progress)
        low += (noise - low) * (1 - math.exp(-2 * math.pi * frequency / RATE))
        high += (noise - high) * (1 - math.exp(-2 * math.pi * 650 / RATE))
        envelope = math.sin(math.pi * progress) ** 2
        value = (low - high) * envelope * 0.15 * energy
        pan = -0.6 + 1.2 * progress
        at = round(0.32 * RATE) + index
        left[at] += value * math.sqrt((1 - pan) / 2)
        right[at] += value * math.sqrt((1 + pan) / 2)

    # The letters separate, in the same interval as the visual spreading.
    for index, note in enumerate(notes):
        start = 1.32 + index * 0.79 / max(1, len(notes) - 1)
        bell(start, note, 0.62, 0.12 * energy, -0.55 + 1.1 * index / max(1, len(notes) - 1))

    # Horizontal result: warm resolution, fanfare, or a descending losing sting.
    for index, note in enumerate(chord):
        bell(2.48 + index * 0.025, note, 0.55, 0.105 * energy, (index - (len(chord) - 1) / 2) * 0.25)
    if name == 'bankrupt':
        add(2.4, 0.6, lambda t: math.sin(2 * math.pi * (95 * t - 32 * t * t))
            * min(1, t / 0.015) * math.exp(-t * 9) * 0.17)
    elif name in ('jackpot', 'bonus'):
        for index in range(4):
            bell(2.55 + index * 0.08, notes[-1] + index * 2, 0.28, 0.035, (-1) ** index * 0.65)

    peak = max(max(map(abs, left)), max(map(abs, right)), 0.0001)
    scale = min(1, 0.86 / peak)
    samples = bytearray()
    for index, (l_sample, r_sample) in enumerate(zip(left, right)):
        fade = min(1, (len(left) - index) / (RATE * 0.09))
        samples.extend(struct.pack('<hh', round(l_sample * scale * fade * 32767), round(r_sample * scale * fade * 32767)))
    return samples


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', required=True)
    args = parser.parse_args()
    temporary = ROOT.parents[1] / '.tmp' / 'infortune-result-sounds'
    temporary.mkdir(parents=True, exist_ok=True)
    for name, profile in PROFILES.items():
        wav = temporary / f'result-{name}.wav'
        with wave.open(str(wav), 'wb') as output:
            output.setnchannels(2); output.setsampwidth(2); output.setframerate(RATE)
            output.writeframes(render(name, *profile))
        target = ROOT / 'assets' / f'result-{name}.mp3'
        subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
                        '-b:a', '128k', '-map_metadata', '-1', str(target)], check=True)
        print(target.name, target.stat().st_size, 'bytes')
