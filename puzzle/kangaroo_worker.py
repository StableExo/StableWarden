"""
============================================================
TheWarden × Bitcoin Puzzle — Kangaroo Worker
============================================================

v3 — FINAL (Gemini + Tasklet joint review)

CHANGES FROM v2:
  - REVERTED: Jacobian batching removed from hot loop.
    Reason: "Delayed jump index" breaks Kangaroo Markov Property.
    The Tame and Wild kangaroos must use f(current_X), not f(X from
    previous batch). Without Multi-Kangaroo Batching they become ghosts.
  - UPGRADED: All modular inverses now use pow(x, -1, P) (EEA).
    Python 3.8+ — ~5-10x faster than pow(x, P-2, P) Fermat method.
  - RETAINED: Jacobian functions kept for future Multi-Kangaroo upgrade.
  - RETAINED: Montgomery batch_inverse kept for jump table construction.

HOT LOOP (v3):
  - Pure affine point_add() per jump
  - pow(x, -1, P) for each modular inverse (fast EEA)
  - Jump index from CURRENT affine X — deterministic, Markov-safe
  - DP check every jump

FUTURE UPGRADE PATH (Multi-Kangaroo Batching):
  Run N Tame + N Wild kangaroos simultaneously.
  Each has its own current affine X → deterministic jump index.
  Batch-invert all N Z-coords together → O(1) pow() for all N.
  Gemini blueprint: "16 Tame + 16 Wild, one batch_inverse for 32."

SIGTERM HANDLING:
  - Python signal handler + bash trap (double-covered)
  - Dying breath releases range back to pending immediately

ATTRIBUTION:
  - Cryptographic optimization: Gemini
  - Architecture / Supabase / GHA orchestration: Tasklet

============================================================
"""

import os
import sys
import time
import signal
import requests
from typing import Optional, Tuple, List

# ============================================================
# secp256k1 CURVE PARAMETERS
# ============================================================
P  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
G  = (Gx, Gy)

TARGET_PUBKEY_HEX = "02e0a8b039282faf6fe0fd769cfbc4b6b4cf8758ba68220eac420e32b91ddfa673"


# ============================================================
# AFFINE EC ARITHMETIC
# pow(x, -1, P) throughout — EEA, ~5-10x faster than pow(x, P-2, P)
# Gemini: "In Python 3.8+, use pow(x, -1, P). It uses the Extended
#          Euclidean Algorithm, significantly faster than Fermat method."
# ============================================================

def point_add_affine(P1: Optional[Tuple], P2: Optional[Tuple]) -> Optional[Tuple]:
    """Full affine point add. Hot loop function in v3."""
    if P1 is None: return P2
    if P2 is None: return P1
    x1, y1 = P1
    x2, y2 = P2
    if x1 == x2:
        if y1 != y2: return None  # Point at infinity
        # Point doubling
        lam = (3 * x1 * x1 * pow(2 * y1, -1, P)) % P
    else:
        lam = ((y2 - y1) * pow(x2 - x1, -1, P)) % P
    x3 = (lam * lam - x1 - x2) % P
    y3 = (lam * (x1 - x3) - y1) % P
    return (x3, y3)


def scalar_mult(k: int, point: Tuple) -> Optional[Tuple]:
    """Scalar mult — ONLY at init for jump table and starting positions."""
    result = None
    addend = point
    while k:
        if k & 1:
            result = point_add_affine(result, addend)
        addend = point_add_affine(addend, addend)
        k >>= 1
    return result


def decompress_pubkey(hex_key: str) -> Tuple[int, int]:
    prefix = int(hex_key[:2], 16)
    x = int(hex_key[2:], 16)
    y_sq = (pow(x, 3, P) + 7) % P
    y = pow(y_sq, (P + 1) // 4, P)
    if (y % 2) != (prefix % 2):
        y = P - y
    return (x, y)


# ============================================================
# JACOBIAN COORDINATES — Retained for Multi-Kangaroo future upgrade
# Not used in v3 hot loop.
# ============================================================

def to_jacobian(p_affine: Tuple) -> Tuple:
    return (p_affine[0], p_affine[1], 1)


def from_jacobian(p_jac: Tuple) -> Optional[Tuple]:
    X, Y, Z = p_jac
    if Z == 0: return None
    Z_inv  = pow(Z, -1, P)
    Z_inv2 = (Z_inv * Z_inv) % P
    Z_inv3 = (Z_inv2 * Z_inv) % P
    return ((X * Z_inv2) % P, (Y * Z_inv3) % P)


def jacobian_double(P1: Tuple) -> Tuple:
    X1, Y1, Z1 = P1
    if Y1 == 0: return (0, 1, 0)
    A  = (4 * X1 * Y1 * Y1) % P
    B  = (3 * X1 * X1) % P
    X3 = (B * B - 2 * A) % P
    Y3 = (B * (A - X3) - 8 * Y1 * Y1 * Y1 * Y1) % P
    Z3 = (2 * Y1 * Z1) % P
    return (X3, Y3, Z3)


def jacobian_add_mixed(P1: Tuple, P2_affine: Tuple) -> Tuple:
    """~11 mults, zero modular inverses. Ready for Multi-Kangaroo v4."""
    X1, Y1, Z1 = P1
    x2, y2 = P2_affine
    if Z1 == 0: return to_jacobian(P2_affine)
    Z1Z1 = (Z1 * Z1) % P
    U2   = (x2 * Z1Z1) % P
    S2   = (y2 * Z1 * Z1Z1) % P
    H    = (U2 - X1) % P
    R    = (S2 - Y1) % P
    if H == 0:
        if R == 0: return jacobian_double(P1)
        else:      return (0, 1, 0)
    HH  = (H * H) % P
    HHH = (H * HH) % P
    V   = (X1 * HH) % P
    X3  = (R * R - HHH - 2 * V) % P
    Y3  = (R * (V - X3) - Y1 * HHH) % P
    Z3  = (Z1 * H) % P
    return (X3, Y3, Z3)


# ============================================================
# MONTGOMERY BATCH INVERSION — Used in jump table construction
# Also ready for Multi-Kangaroo v4 hot loop.
# ============================================================

def batch_inverse(vals: List[int]) -> List[int]:
    """n inverses for the cost of 1 pow(). Gemini: Montgomery method."""
    n = len(vals)
    if n == 0: return []
    prefix = [0] * n
    prefix[0] = vals[0]
    for i in range(1, n):
        prefix[i] = (prefix[i - 1] * vals[i]) % P
    curr_inv = pow(prefix[-1], -1, P)   # EEA — faster than P-2 Fermat
    res = [0] * n
    for i in range(n - 1, 0, -1):
        res[i] = (curr_inv * prefix[i - 1]) % P
        curr_inv = (curr_inv * vals[i]) % P
    res[0] = curr_inv
    return res


# ============================================================
# JUMP TABLE (Built at startup — affine, powers of 2)
# jump_table[i] = 2^i * G
# Gemini: "Powers of 2 — significantly faster on CPUs."
# Gemini: "Tame and Wild MUST use identical table — critical."
# ============================================================
print("Building jump table...", flush=True)
JUMP_TABLE_SIZE = 32
jump_table = [scalar_mult(1 << i, G) for i in range(JUMP_TABLE_SIZE)]
print(f"Jump table ready ({JUMP_TABLE_SIZE} entries)", flush=True)


# ============================================================
# DISTINGUISHED POINT LOGIC
# Gemini: "First 32-36 bits of X-coordinate are zero."
# ============================================================
DP_MASK_BITS = int(os.environ.get("DP_MASK_BITS", "34"))
DP_MASK      = (1 << DP_MASK_BITS) - 1

def is_distinguished(point: Tuple) -> bool:
    return (point[0] & DP_MASK) == 0

def get_jump_index(point: Tuple) -> int:
    """
    Deterministic — MUST use CURRENT affine X.
    Both Tame and Wild use the same function.
    Gemini: "If they use different indices, they jump to different points
    and never collide — they pass each other like ghosts."
    """
    return point[0] % JUMP_TABLE_SIZE


# ============================================================
# SUPABASE CLIENT
# ============================================================
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY  = os.environ.get("SUPABASE_ANON_KEY", "")
PUZZLE_NUMBER = int(os.environ.get("PUZZLE_NUMBER", "160"))
WORKER_ID     = os.environ.get("WORKER_ID", f"worker-local-{int(time.time())}")
MAX_RUNTIME   = int(os.environ.get("MAX_RUNTIME_MINUTES", "340")) * 60

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

_current_range_id: Optional[int] = None
_current_jumps: int = 0


def supabase_post(table: str, data: dict) -> dict:
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", json=data, headers=headers)
    return r.json()

def supabase_patch(table: str, query: str, data: dict):
    requests.patch(f"{SUPABASE_URL}/rest/v1/{table}?{query}", json=data, headers=headers)

def supabase_get(table: str, query: str) -> list:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{query}", headers=headers)
    return r.json()

def supabase_rpc(fn: str, params: dict) -> dict:
    r = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/{fn}", json=params, headers=headers)
    return r.json()


# ============================================================
# SIGTERM HANDLER — Dying Breath
# Gemini: "Trap to send final heartbeat on SIGTERM."
# Double-covered: Python signal + bash trap in YAML.
# ============================================================
def sigterm_handler(signum, frame):
    print(f"\n⚡ SIGTERM received. Sending dying breath...", flush=True)
    if _current_range_id is not None:
        try:
            supabase_patch("puzzle_ranges", f"id=eq.{_current_range_id}", {
                "status": "pending",
                "worker_id": None,
                "last_seen": None,
                "keys_checked": _current_jumps
            })
            supabase_patch("puzzle_workers", f"worker_id=eq.{WORKER_ID}", {
                "status": "dead",
                "total_jumps": _current_jumps
            })
            print("Dying breath sent. Range returned to pool.", flush=True)
        except Exception as e:
            print(f"Dying breath failed: {e}", flush=True)
    sys.exit(0)

signal.signal(signal.SIGTERM, sigterm_handler)


def claim_range() -> Optional[dict]:
    result = supabase_rpc("claim_next_range", {
        "p_puzzle_number": PUZZLE_NUMBER,
        "p_worker_id": WORKER_ID
    })
    if isinstance(result, list) and len(result) > 0:
        return result[0]
    return None


def heartbeat(range_id: int, keys_checked: int):
    supabase_patch("puzzle_ranges", f"id=eq.{range_id}",
        {"last_seen": "now()", "keys_checked": keys_checked})
    supabase_patch("puzzle_workers", f"worker_id=eq.{WORKER_ID}",
        {"last_seen": "now()", "total_jumps": keys_checked})


def report_dp(x_coord: int, y_coord: int, distance: int, ktype: str):
    try:
        result = supabase_post("distinguished_points", {
            "puzzle_number": PUZZLE_NUMBER,
            "x_coord": hex(x_coord),
            "y_coord": hex(y_coord),
            "distance": hex(distance),
            "kangaroo_type": ktype,
            "worker_id": WORKER_ID
        })
        if isinstance(result, dict) and result.get("code") == "23505":
            print(f"\n🎯 COLLISION DETECTED on x={hex(x_coord)[:20]}...", flush=True)
            check_collision(x_coord, distance, ktype)
    except Exception as e:
        print(f"DP report error: {e}", flush=True)


def check_collision(x_coord: int, our_distance: int, our_type: str):
    existing = supabase_get("distinguished_points",
        f"puzzle_number=eq.{PUZZLE_NUMBER}&x_coord=eq.{hex(x_coord)}")
    if not existing: return

    other      = existing[0]
    other_type = other["kangaroo_type"]
    other_dist = int(other["distance"], 16)

    if other_type == our_type: return  # Same type — not a collision

    if our_type == "tame":
        candidate = (our_distance - other_dist) % N
    else:
        candidate = (other_dist - our_distance) % N

    print(f"\n🔑 CANDIDATE KEY: {hex(candidate)}", flush=True)

    supabase_post("collision_log", {
        "puzzle_number": PUZZLE_NUMBER,
        "tame_x":        hex(x_coord),
        "tame_distance": hex(our_distance) if our_type == "tame" else hex(other_dist),
        "wild_x":        hex(x_coord),
        "wild_distance": hex(our_distance) if our_type == "wild" else hex(other_dist),
        "candidate_key": hex(candidate),
        "verified":      False
    })
    # TODO: verify candidate → Flashbots private sweep → 16 BTC 🎯


# ============================================================
# MAIN KANGAROO LOOP — v3 (Pure Affine, Deterministic, Markov-safe)
#
# Gemini final verdict:
# "If you can't implement Multi-Kangaroo Batching yet, stick to
#  Affine Addition with the fast pow(x, -1, P) inverse. In Python,
#  the interpreter overhead is high enough that the Jacobian gain
#  is often eaten by the batching complexity anyway."
# ============================================================
def run_kangaroo(range_start: int, range_end: int, range_id: int):
    global _current_range_id, _current_jumps

    _current_range_id = range_id
    target      = decompress_pubkey(TARGET_PUBKEY_HEX)
    range_width = range_end - range_start

    # --- INIT ---
    tame_scalar = range_start + (range_width // 2)
    tame_point  = scalar_mult(tame_scalar, G)
    tame_dist   = tame_scalar

    wild_offset = int.from_bytes(os.urandom(20), 'big') % range_width
    wild_point  = point_add_affine(target, scalar_mult(wild_offset, G))
    wild_dist   = wild_offset

    jumps           = 0
    dps_found       = 0
    last_heartbeat  = time.time()
    start_time      = time.time()

    print(f"Starting Kangaroo v3 (Affine/EEA) | Range: {hex(range_start)[:12]}...", flush=True)

    while True:
        # --- TAME JUMP ---
        tame_ji     = get_jump_index(tame_point)        # f(current X) — Markov-safe
        tame_point  = point_add_affine(tame_point, jump_table[tame_ji])
        tame_dist  += (1 << tame_ji)

        # --- WILD JUMP ---
        wild_ji     = get_jump_index(wild_point)        # f(current X) — Markov-safe
        wild_point  = point_add_affine(wild_point, jump_table[wild_ji])
        wild_dist  += (1 << wild_ji)

        jumps          += 2
        _current_jumps  = jumps

        # --- DP CHECKS ---
        if tame_point and is_distinguished(tame_point):
            report_dp(tame_point[0], tame_point[1], tame_dist, "tame")
            dps_found += 1

        if wild_point and is_distinguished(wild_point):
            report_dp(wild_point[0], wild_point[1], wild_dist, "wild")
            dps_found += 1

        # --- HEARTBEAT (every 5 min) ---
        now = time.time()
        if now - last_heartbeat > 300:
            heartbeat(range_id, jumps)
            elapsed = now - start_time
            speed   = jumps / elapsed if elapsed > 0 else 0
            print(f"  Jumps: {jumps:,} | DPs: {dps_found} | Speed: {speed:.0f} j/s", flush=True)
            last_heartbeat = now

        # --- MAX RUNTIME ---
        if time.time() - start_time > MAX_RUNTIME:
            print(f"Max runtime reached. Jumps: {jumps:,}", flush=True)
            break

    supabase_patch("puzzle_ranges", f"id=eq.{range_id}",
        {"status": "done", "completed_at": "now()", "keys_checked": jumps})
    print(f"Range complete. Total jumps: {jumps:,}", flush=True)


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == "__main__":
    print(f"Worker {WORKER_ID} online | Puzzle #{PUZZLE_NUMBER}", flush=True)

    supabase_post("puzzle_workers", {
        "worker_id":     WORKER_ID,
        "puzzle_number": PUZZLE_NUMBER,
        "status":        "active"
    })

    claimed = claim_range()
    if not claimed:
        print("No ranges available. Exiting.", flush=True)
        sys.exit(0)

    print(f"Claimed range: {claimed['range_start']} → {claimed['range_end']}", flush=True)

    range_start = int(claimed['range_start'], 16)
    range_end   = int(claimed['range_end'], 16)
    range_id    = claimed['range_id']

    run_kangaroo(range_start, range_end, range_id)
