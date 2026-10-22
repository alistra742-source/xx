#!/usr/bin/env python3
"""Synthesize speech with edge-tts and report word timings.

Usage: edge-words.py VOICE RATE OUT_MP3 < text
Prints one JSON line to stdout: {"words": [{"text", "start", "end"}]} with
times in seconds. The text is read from stdin so it never appears in argv.
"""
import asyncio
import json
import sys

import edge_tts


async def main():
    voice, rate, out = sys.argv[1], sys.argv[2], sys.argv[3]
    text = sys.stdin.read()
    communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    words = []
    with open(out, "wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 10_000_000
                end = (chunk["offset"] + chunk["duration"]) / 10_000_000
                words.append({"text": chunk["text"], "start": start, "end": end})
    sys.stdout.write(json.dumps({"words": words}))


if __name__ == "__main__":
    asyncio.run(main())
