#!/usr/bin/env python3
"""
PowerfulMoss Puzzle Analysis Script
Runs: stegolsb wavsteg, whisper transcription, frequency peak analysis
Cross-references all findings against BIP-39 wordlist
Outputs: results/findings.json + POSTs to Supabase
"""

import os
import sys
import json
import subprocess
import struct
import wave
import numpy as np
import requests
from pathlib import Path

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

TRACKS = [
    (1,  "01 the_harbor_final.wav",               "the_harbor"),
    (2,  "02 sewer_systems_final.wav",             "sewer_systems"),
    (3,  "03 waterfall_1_final.wav",               "waterfall_1"),
    (4,  "04 waterfall_2_final.wav",               "waterfall_2"),
    (5,  "05 waterfall_3_final.wav",               "waterfall_3"),
    (6,  "06 spire_final.wav",                     "spire"),
    (7,  "07 cliffside_1_final.wav",               "cliffside_1"),
    (8,  "08 cliffside_2_final.wav",               "cliffside_2"),
    (9,  "09 waterfall_4_final.wav",               "waterfall_4"),
    (10, "10 cliffside_final.wav",                 "cliffside"),
    (11, "11 the_beacon_final.wav",                "the_beacon"),
    (12, "12 finale_final.wav",                    "finale"),
]

BIP39_URL = "https://raw.githubusercontent.com/trezor/python-mnemonic/master/src/mnemonic/wordlist/english.txt"

def load_bip39():
    r = requests.get(BIP39_URL, timeout=30)
    words = set(w.strip().lower() for w in r.text.splitlines() if w.strip())
    print(f"[BIP39] Loaded {len(words)} words")
    return words

def cross_reference(text, bip39):
    if not text:
        return []
    tokens = []
    for w in text.lower().split():
        clean = ''.join(c for c in w if c.isalpha())
        if clean in bip39:
            tokens.append(clean)
    return list(set(tokens))

def run_stegolsb(wav_path, num_bits=1):
    """Try stegolsb wavsteg read with various bit counts"""
    results = []
    for bits in range(1, 5):
        try:
            out = subprocess.run(
                ["stegolsb", "wavsteg", "-r", "-i", str(wav_path), "-n", str(bits), "-o", "/tmp/steg_out.txt", "-b", "1000"],
                capture_output=True, text=True, timeout=60
            )
            if os.path.exists("/tmp/steg_out.txt"):
                with open("/tmp/steg_out.txt", "rb") as f:
                    raw = f.read()
                # Try decode as text
                try:
                    decoded = raw.decode("utf-8").strip()
                    if any(32 <= ord(c) <= 126 for c in decoded[:50]):
                        results.append({"bits": bits, "output": decoded[:500], "raw_hex": raw[:64].hex()})
                except:
                    results.append({"bits": bits, "output": None, "raw_hex": raw[:64].hex()})
                os.remove("/tmp/steg_out.txt")
        except Exception as e:
            results.append({"bits": bits, "error": str(e)})
    return results

def run_whisper(wav_path):
    """Run whisper transcription"""
    try:
        out = subprocess.run(
            ["whisper", str(wav_path), "--model", "base", "--output_format", "txt",
             "--output_dir", "/tmp/whisper_out", "--language", "en"],
            capture_output=True, text=True, timeout=600
        )
        txt_path = f"/tmp/whisper_out/{wav_path.stem}.txt"
        if os.path.exists(txt_path):
            with open(txt_path) as f:
                return f.read().strip()
        # also check stdout
        return out.stdout.strip() or out.stderr.strip()
    except Exception as e:
        return f"ERROR: {e}"

def run_frequency_analysis(wav_path):
    """Extract prominent frequency peaks - previous puzzle used these to index words"""
    try:
        import scipy.io.wavfile as wavfile
        from scipy.fft import rfft, rfftfreq
        
        rate, data = wavfile.read(str(wav_path))
        if data.ndim > 1:
            data = data[:, 0]  # mono
        
        # Analyze in chunks to find recurring peaks
        chunk_size = rate * 5  # 5 second chunks
        all_peaks = []
        
        for i in range(0, min(len(data), rate * 60), chunk_size):  # first 60 seconds
            chunk = data[i:i+chunk_size].astype(float)
            if len(chunk) < 1000:
                continue
            spectrum = np.abs(rfft(chunk))
            freqs = rfftfreq(len(chunk), 1/rate)
            
            # Find top 5 peaks
            top_indices = np.argsort(spectrum)[-10:]
            for idx in top_indices:
                if freqs[idx] > 20:  # ignore DC
                    all_peaks.append(float(freqs[idx]))
        
        # Round to nearest 10Hz and find most common
        rounded = [round(f, -1) for f in all_peaks]
        from collections import Counter
        common = Counter(rounded).most_common(10)
        
        return {
            "sample_rate": rate,
            "duration_sec": len(data) / rate,
            "top_frequencies": [{"freq_hz": f, "count": c} for f, c in common]
        }
    except Exception as e:
        return {"error": str(e)}

def analyze_wav_binary(wav_path):
    """Check end of WAV file for appended data, check for unusual chunks"""
    findings = []
    try:
        with open(wav_path, "rb") as f:
            raw = f.read()
        
        # Check for 'data' chunk and see if there's trailing data
        with wave.open(str(wav_path)) as w:
            n_frames = w.getnframes()
            n_channels = w.getnchannels()
            sampwidth = w.getsampwidth()
            data_size = n_frames * n_channels * sampwidth
        
        # Find 'data' chunk in raw
        data_offset = raw.find(b'data')
        if data_offset >= 0:
            chunk_size = struct.unpack_from('<I', raw, data_offset + 4)[0]
            expected_end = data_offset + 8 + chunk_size
            trailing = raw[expected_end:]
            if trailing:
                findings.append({
                    "type": "trailing_data",
                    "size_bytes": len(trailing),
                    "hex_preview": trailing[:64].hex(),
                    "ascii_preview": ''.join(chr(b) if 32 <= b < 127 else '.' for b in trailing[:64])
                })
        
        # Check for extra RIFF chunks (LIST, id3, etc)
        pos = 12  # skip RIFF header
        while pos < len(raw) - 8:
            try:
                chunk_id = raw[pos:pos+4].decode('ascii', errors='replace')
                chunk_size = struct.unpack_from('<I', raw, pos+4)[0]
                if chunk_id not in ('fmt ', 'data', 'LIST', 'fact', 'smpl', 'plst', 'ltxt', 'note', 'labl', 'adtl'):
                    findings.append({
                        "type": "unknown_chunk",
                        "chunk_id": chunk_id,
                        "size": chunk_size,
                        "offset": pos,
                        "preview": raw[pos+8:pos+72].hex()
                    })
                pos += 8 + chunk_size + (chunk_size % 2)  # word-align
                if pos <= 12:
                    break
            except:
                break
        
        # Check for readable strings in the whole file
        strings = []
        current = ""
        for byte in raw:
            if 32 <= byte < 127:
                current += chr(byte)
            else:
                if len(current) >= 6:
                    strings.append(current)
                current = ""
        findings.append({"type": "readable_strings", "strings": strings[:100]})
        
    except Exception as e:
        findings.append({"type": "error", "message": str(e)})
    
    return findings

def post_to_supabase(record):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/powerfulmoss_findings",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            json=record,
            timeout=15
        )
        if r.status_code not in (200, 201):
            print(f"  [Supabase] Error {r.status_code}: {r.text[:200]}")
        else:
            print(f"  [Supabase] Posted: track {record['track_number']} / {record['analysis_type']}")
    except Exception as e:
        print(f"  [Supabase] Exception: {e}")

def main():
    wav_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    os.makedirs("results", exist_ok=True)
    os.makedirs("/tmp/whisper_out", exist_ok=True)
    
    bip39 = load_bip39()
    all_findings = []
    
    print("\n" + "="*60)
    print("POWERFULMOSS PUZZLE ANALYSIS")
    print("="*60 + "\n")
    
    for track_num, filename, track_id in TRACKS:
        wav_path = wav_dir / filename
        if not wav_path.exists():
            print(f"[SKIP] {filename} not found")
            continue
        
        print(f"\n[TRACK {track_num:02d}] {filename}")
        print("-" * 40)
        
        # 1. STEGANOGRAPHY ANALYSIS
        print("  Running stegolsb...")
        steg_results = run_stegolsb(wav_path)
        steg_raw = json.dumps(steg_results)
        steg_bip39 = []
        for r in steg_results:
            if r.get("output"):
                steg_bip39.extend(cross_reference(r["output"], bip39))
        
        record = {
            "track_number": track_num,
            "track_name": track_id,
            "analysis_type": "wavsteg",
            "raw_output": steg_raw[:5000],
            "bip39_candidates": steg_bip39,
            "notes": f"Tested bits 1-4"
        }
        all_findings.append(record)
        post_to_supabase(record)
        print(f"  Steg BIP39 candidates: {steg_bip39}")
        
        # 2. BINARY / CHUNK ANALYSIS
        print("  Analyzing WAV binary structure...")
        binary_results = analyze_wav_binary(wav_path)
        binary_bip39 = []
        for item in binary_results:
            if item.get("type") == "readable_strings":
                for s in item.get("strings", []):
                    binary_bip39.extend(cross_reference(s, bip39))
        
        record = {
            "track_number": track_num,
            "track_name": track_id,
            "analysis_type": "binary_analysis",
            "raw_output": json.dumps(binary_results)[:5000],
            "bip39_candidates": list(set(binary_bip39)),
            "notes": "Trailing data, unknown chunks, readable strings"
        }
        all_findings.append(record)
        post_to_supabase(record)
        print(f"  Binary BIP39 candidates: {list(set(binary_bip39))[:10]}")
        
        # 3. FREQUENCY ANALYSIS
        print("  Running frequency analysis...")
        freq_results = run_frequency_analysis(wav_path)
        record = {
            "track_number": track_num,
            "track_name": track_id,
            "analysis_type": "frequency",
            "raw_output": json.dumps(freq_results)[:3000],
            "bip39_candidates": [],
            "notes": "Top frequency peaks - may index BIP39 words"
        }
        all_findings.append(record)
        post_to_supabase(record)
        print(f"  Top freqs: {[f['freq_hz'] for f in freq_results.get('top_frequencies', [])[:5]]}")
        
        # 4. WHISPER TRANSCRIPTION
        print("  Running Whisper transcription (this takes a few minutes)...")
        transcript = run_whisper(wav_path)
        whisper_bip39 = cross_reference(transcript, bip39)
        record = {
            "track_number": track_num,
            "track_name": track_id,
            "analysis_type": "whisper",
            "raw_output": transcript[:5000],
            "bip39_candidates": whisper_bip39,
            "notes": "Whisper base model, English"
        }
        all_findings.append(record)
        post_to_supabase(record)
        print(f"  Transcript: {transcript[:200]}")
        print(f"  Whisper BIP39 candidates: {whisper_bip39}")
    
    # Save all results
    with open("results/findings.json", "w") as f:
        json.dump(all_findings, f, indent=2)
    
    # Summary: aggregate all BIP39 candidates per track
    print("\n" + "="*60)
    print("SUMMARY: BIP-39 CANDIDATES PER TRACK")
    print("="*60)
    
    summary = {}
    for finding in all_findings:
        t = finding["track_number"]
        if t not in summary:
            summary[t] = {"track": finding["track_name"], "candidates": set()}
        summary[t]["candidates"].update(finding.get("bip39_candidates") or [])
    
    for t in sorted(summary.keys()):
        cands = list(summary[t]["candidates"])
        print(f"  Track {t:02d} ({summary[t]['track']}): {cands}")
    
    with open("results/summary.json", "w") as f:
        json.dump({str(k): {"track": v["track"], "candidates": list(v["candidates"])} for k, v in summary.items()}, f, indent=2)
    
    print("\nDone. Results written to results/findings.json and results/summary.json")

if __name__ == "__main__":
    main()
